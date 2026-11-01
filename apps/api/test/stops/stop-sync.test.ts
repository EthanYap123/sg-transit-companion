import { describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../../src/cache/store.js';
import { LtaError } from '../../src/lta/errors.js';
import type { LtaBusStop } from '../../src/lta/schemas.js';
import { StopIndex } from '../../src/stops/stop-index.js';
import { STOPS_SNAPSHOT_KEY, StopSyncService, SyncInProgressError } from '../../src/stops/stop-sync.js';
import { FakeStopRepository } from '../helpers/fake-stop-repository.js';

const ltaStop = (n: number): LtaBusStop => ({
  BusStopCode: String(10_000 + n).padStart(5, '0'),
  Description: `Stop ${n}`,
  RoadName: 'Victoria St',
  Latitude: 1.3,
  Longitude: 103.8,
});
const ltaStops = (count: number) => Array.from({ length: count }, (_, i) => ltaStop(i));

function setup(options: { store?: MemoryStore | null } = {}) {
  const repo = new FakeStopRepository();
  const store = options.store === undefined ? new MemoryStore() : options.store;
  const index = new StopIndex();
  const getAllBusStops = vi.fn(() => Promise.resolve(ltaStops(10)));
  const onError = vi.fn();
  const service = new StopSyncService({ lta: { getAllBusStops }, repo, store, index, onError });
  return { service, repo, store, index, getAllBusStops, onError };
}

describe('StopSyncService.start', () => {
  it('syncs LTA stops into Postgres, the index and the Redis snapshot', async () => {
    const { service, repo, store, index } = setup();

    const { runId, done } = await service.start();
    const result = await done;

    expect(result).toMatchObject({ runId, recordCount: 10 });
    expect(repo.stops.size).toBe(10);
    expect(index.size).toBe(10);
    expect(index.get('10003')?.description).toBe('Stop 3');
    expect(repo.runs.get(runId)).toEqual({ status: 'ok', recordCount: 10 });
    const snapshot = JSON.parse((await store!.get(STOPS_SNAPSHOT_KEY))!) as { v: number; stops: unknown[] };
    expect(snapshot.v).toBe(1);
    expect(snapshot.stops[0]).toEqual(['10000', 'Stop 0', 'Victoria St', 1.3, 103.8]);
    expect(service.syncedAt).not.toBeNull();
  });

  it('runs one sync at a time', async () => {
    const { service } = setup();

    const first = await service.start();
    expect(service.isRunning).toBe(true);
    await expect(service.start()).rejects.toBeInstanceOf(SyncInProgressError);

    await first.done;
    expect(service.isRunning).toBe(false);
    await expect(service.start().then((s) => s.done)).resolves.toMatchObject({ recordCount: 10 });
  });

  it('records a failed run and keeps the current index when LTA fails', async () => {
    const { service, repo, index, getAllBusStops } = setup();
    index.replace([
      { code: '01012', description: 'Old', roadName: 'Victoria St', latitude: 1, longitude: 103 },
    ]);
    getAllBusStops.mockRejectedValue(new LtaError('timeout', 'LTA did not answer'));

    const { runId, done } = await service.start();

    await expect(done).rejects.toThrow('LTA did not answer');
    expect(repo.runs.get(runId)).toMatchObject({ status: 'failed', error: 'LTA did not answer' });
    expect(index.get('01012')?.description).toBe('Old');
    expect(service.isRunning).toBe(false);
  });

  it('refuses a sync that returns far fewer stops than the index has', async () => {
    const { service, index, getAllBusStops, repo } = setup();
    await (
      await service.start()
    ).done;
    getAllBusStops.mockResolvedValue(ltaStops(4));

    const { runId, done } = await service.start();

    await expect(done).rejects.toThrow('fewer than the 5 expected');
    expect(index.size).toBe(10);
    expect(repo.runs.get(runId)).toMatchObject({ status: 'failed' });
  });

  it('works without Redis', async () => {
    const { service, index } = setup({ store: null });

    await (
      await service.start()
    ).done;

    expect(index.size).toBe(10);
  });
});

describe('StopSyncService.loadIndex', () => {
  it('loads from the Redis snapshot without touching Postgres or LTA', async () => {
    const first = setup();
    await (
      await first.service.start()
    ).done;
    const second = setup({ store: first.store });
    const findCurrent = vi.spyOn(second.repo, 'findCurrent');

    const result = await second.service.loadIndex();

    expect(result).toEqual({ source: 'redis', count: 10 });
    expect(second.index.get('10009')?.description).toBe('Stop 9');
    expect(findCurrent).not.toHaveBeenCalled();
    expect(second.getAllBusStops).not.toHaveBeenCalled();
  });

  it('falls back to Postgres and refills the Redis snapshot', async () => {
    const { service, repo, store, index, getAllBusStops } = setup();
    await repo.upsertAll(
      [
        {
          code: '01012',
          description: 'Hotel Grand Pacific',
          roadName: 'Victoria St',
          latitude: 1,
          longitude: 103,
        },
      ],
      new Date(),
    );

    const result = await service.loadIndex();

    expect(result).toEqual({ source: 'postgres', count: 1 });
    expect(index.get('01012')).toBeDefined();
    expect(await store!.get(STOPS_SNAPSHOT_KEY)).toContain('Hotel Grand Pacific');
    expect(getAllBusStops).not.toHaveBeenCalled();
  });

  it('syncs from LTA when Redis and Postgres are empty', async () => {
    const { service } = setup();

    await expect(service.loadIndex()).resolves.toEqual({ source: 'lta', count: 10 });
  });

  it('ignores a corrupt snapshot', async () => {
    const store = new MemoryStore();
    await store.set(STOPS_SNAPSHOT_KEY, '{"v":2}');
    const { service } = setup({ store });

    await expect(service.loadIndex()).resolves.toMatchObject({ source: 'lta' });
  });

  it('reports none, without throwing, when every source fails', async () => {
    const { service, repo, getAllBusStops, onError } = setup();
    repo.failFind = true;
    getAllBusStops.mockRejectedValue(new LtaError('network', 'Could not reach LTA'));

    await expect(service.loadIndex()).resolves.toEqual({ source: 'none', count: 0 });
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'load stops from Postgres');
    expect(onError).toHaveBeenCalledWith(expect.any(LtaError), 'sync stops from LTA');
  });
});
