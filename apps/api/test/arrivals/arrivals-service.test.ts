import { describe, expect, it, vi } from 'vitest';
import { ArrivalsService, ArrivalsUnavailableError } from '../../src/arrivals/arrivals-service.js';
import { CommandBudget } from '../../src/cache/command-budget.js';
import { MemoryStore, type CacheStore } from '../../src/cache/store.js';
import { LtaError } from '../../src/lta/errors.js';
import { ltaBusArrivalSchema, type LtaBusArrival } from '../../src/lta/schemas.js';
import { ltaFixture } from '../helpers/fixtures.js';

const DAY = ltaBusArrivalSchema.parse(ltaFixture('bus-arrival-83139-day'));
const START = Date.parse('2026-10-31T17:00:00+08:00');
const SECOND = 1_000;
const MINUTE = 60 * SECOND;

function setup(options: { store?: CacheStore | null; dailyLimit?: number; maxEntries?: number } = {}) {
  let time = START;
  const now = () => time;
  const store = options.store === undefined ? new MemoryStore(now) : options.store;
  const getBusArrival = vi.fn((_stop: string): Promise<LtaBusArrival> => Promise.resolve(DAY));
  const onStoreError = vi.fn();
  const make = () =>
    new ArrivalsService({
      lta: { getBusArrival },
      store,
      budget: new CommandBudget({ dailyLimit: options.dailyLimit ?? 1_000, now }),
      now,
      maxEntries: options.maxEntries,
      onStoreError,
    });
  return {
    service: make(),
    restart: make,
    store,
    getBusArrival,
    onStoreError,
    advance: (ms: number) => (time += ms),
  };
}

const ltaDown = () => Promise.reject(new LtaError('timeout', 'LTA did not answer'));

describe('fresh data', () => {
  it('fetches from LTA the first time and normalises the response', async () => {
    const { service, getBusArrival } = setup();

    const result = await service.getArrivals('83139');

    expect(getBusArrival).toHaveBeenCalledWith('83139');
    expect(result).toMatchObject({ stopCode: '83139', stale: false, source: 'lta' });
    expect(result.fetchedAt).toBe('2026-10-31T17:00:00+08:00');
    expect(result.services.map((s) => s.serviceNo)).toEqual(['15', '150', '155']);
  });

  it('serves from memory for 20 s, then calls LTA again', async () => {
    const { service, getBusArrival, advance } = setup();

    await service.getArrivals('83139');
    advance(19 * SECOND);
    await service.getArrivals('83139');
    expect(getBusArrival).toHaveBeenCalledTimes(1);

    advance(1 * SECOND);
    const result = await service.getArrivals('83139');
    expect(getBusArrival).toHaveBeenCalledTimes(2);
    expect(result.fetchedAt).toBe('2026-10-31T17:00:20+08:00');
  });

  it('shares one LTA call between requests that arrive together', async () => {
    const { service, getBusArrival } = setup();

    const results = await Promise.all([1, 2, 3, 4, 5].map(() => service.getArrivals('83139')));

    expect(getBusArrival).toHaveBeenCalledTimes(1);
    expect(new Set(results.map((r) => r.fetchedAt)).size).toBe(1);
  });

  it('keeps stops separate', async () => {
    const { service, getBusArrival } = setup();

    await service.getArrivals('83139');
    await service.getArrivals('01012');

    expect(getBusArrival.mock.calls.map(([stop]) => stop)).toEqual(['83139', '01012']);
  });

  it('forgets the least recently used stops past the memory limit', async () => {
    const { service, getBusArrival } = setup({ store: null, maxEntries: 2 });

    await service.getArrivals('A');
    await service.getArrivals('B');
    await service.getArrivals('A');
    await service.getArrivals('C');
    await service.getArrivals('A');
    await service.getArrivals('B');

    expect(getBusArrival.mock.calls.map(([stop]) => stop)).toEqual(['A', 'B', 'C', 'B']);
  });
});

describe('Redis snapshots', () => {
  it('writes a snapshot with a 10 minute expiry', async () => {
    const { service, store } = setup();

    await service.getArrivals('83139');

    const saved = JSON.parse((await store!.get('arr:83139'))!) as { fetchedAtMs: number };
    expect(saved.fetchedAtMs).toBe(START);
    expect((store as MemoryStore).ttl('arr:83139')).toBe(600);
  });

  it('writes each stop at most once a minute', async () => {
    const store = new MemoryStore();
    const set = vi.spyOn(store, 'set');
    const { service, advance } = setup({ store });

    for (let i = 0; i < 6; i += 1) {
      await service.getArrivals('83139');
      advance(20 * SECOND);
    }

    expect(set).toHaveBeenCalledTimes(2);
  });

  it('after a restart, serves a fresh snapshot without calling LTA', async () => {
    const { service, restart, getBusArrival, advance } = setup();
    await service.getArrivals('83139');
    advance(10 * SECOND);

    const result = await restart().getArrivals('83139');

    expect(result).toMatchObject({ source: 'cache', stale: false });
    expect(getBusArrival).toHaveBeenCalledTimes(1);
  });

  it('after a restart, calls LTA when the snapshot is older than 20 s', async () => {
    const { service, restart, getBusArrival, advance } = setup();
    await service.getArrivals('83139');
    advance(30 * SECOND);

    const result = await restart().getArrivals('83139');

    expect(result.source).toBe('lta');
    expect(getBusArrival).toHaveBeenCalledTimes(2);
  });

  it('reads Redis only once per stop after a restart', async () => {
    const store = new MemoryStore();
    const get = vi.spyOn(store, 'get');
    const { service, advance } = setup({ store });

    await service.getArrivals('83139');
    advance(30 * SECOND);
    await service.getArrivals('83139');

    expect(get).toHaveBeenCalledTimes(1);
  });

  it('ignores a snapshot it cannot read', async () => {
    const store = new MemoryStore();
    await store.set('arr:83139', 'not json');
    const { service, getBusArrival } = setup({ store });

    await expect(service.getArrivals('83139')).resolves.toMatchObject({ source: 'lta' });
    expect(getBusArrival).toHaveBeenCalledTimes(1);
  });
});

describe('when LTA is down', () => {
  it('serves the last data from memory, flagged stale, for up to 10 minutes', async () => {
    const { service, getBusArrival, advance } = setup();
    await service.getArrivals('83139');
    getBusArrival.mockImplementation(ltaDown);

    advance(9 * MINUTE);
    const result = await service.getArrivals('83139');
    expect(result).toMatchObject({ stale: true, source: 'stale', fetchedAt: '2026-10-31T17:00:00+08:00' });

    advance(1 * MINUTE);
    await expect(service.getArrivals('83139')).rejects.toBeInstanceOf(ArrivalsUnavailableError);
  });

  it('falls back to the Redis snapshot after a restart', async () => {
    const { service, restart, getBusArrival, advance } = setup();
    await service.getArrivals('83139');
    getBusArrival.mockImplementation(ltaDown);
    advance(5 * MINUTE);

    const result = await restart().getArrivals('83139');

    expect(result).toMatchObject({ stale: true, source: 'stale' });
  });

  it('explains why when there is nothing to fall back on', async () => {
    const { service, getBusArrival } = setup();
    getBusArrival.mockImplementation(ltaDown);

    const err = await service.getArrivals('83139').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ArrivalsUnavailableError);
    expect((err as ArrivalsUnavailableError).ltaError.kind).toBe('timeout');
  });

  it('does not hide bugs that are not LTA failures', async () => {
    const { service, getBusArrival } = setup();
    getBusArrival.mockRejectedValue(new TypeError('boom'));

    await expect(service.getArrivals('83139')).rejects.toBeInstanceOf(TypeError);
  });

  it('lets the next request try LTA again after a failure', async () => {
    const { service, getBusArrival } = setup();
    getBusArrival.mockImplementationOnce(ltaDown);

    await expect(service.getArrivals('83139')).rejects.toBeInstanceOf(ArrivalsUnavailableError);
    await expect(service.getArrivals('83139')).resolves.toMatchObject({ source: 'lta' });
  });
});

describe('without Redis', () => {
  it('works from memory when Redis is not configured', async () => {
    const { service, getBusArrival } = setup({ store: null });

    await service.getArrivals('83139');
    await service.getArrivals('83139');

    expect(getBusArrival).toHaveBeenCalledTimes(1);
  });

  it('keeps serving when Redis commands fail, and reports the errors', async () => {
    const broken: CacheStore = {
      get: () => Promise.reject(new Error('ECONNREFUSED')),
      set: () => Promise.reject(new Error('ECONNREFUSED')),
      incrBy: () => Promise.reject(new Error('ECONNREFUSED')),
      ping: () => Promise.resolve(false),
      close: () => Promise.resolve(),
    };
    const { service, onStoreError } = setup({ store: broken });

    await expect(service.getArrivals('83139')).resolves.toMatchObject({ source: 'lta' });
    await vi.waitFor(() => expect(onStoreError).toHaveBeenCalledTimes(2));
  });

  it('stops using Redis once the daily command budget is spent', async () => {
    const store = new MemoryStore();
    const get = vi.spyOn(store, 'get');
    const set = vi.spyOn(store, 'set');
    const { service } = setup({ store, dailyLimit: 1 });

    await service.getArrivals('83139');

    expect(get).toHaveBeenCalledTimes(1);
    expect(set).not.toHaveBeenCalled();
  });
});
