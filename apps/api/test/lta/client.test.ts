import { describe, expect, it, vi } from 'vitest';
import { CircuitBreaker } from '../../src/lta/circuit-breaker.js';
import { createLtaClient, LTA_PAGE_SIZE, type LtaClientOptions } from '../../src/lta/client.js';
import { LtaError } from '../../src/lta/errors.js';
import { jsonResponse, ltaFixture } from '../helpers/fixtures.js';

const BASE_URL = 'https://lta.example/ltaodataservice';

function setup(responses: Array<Response | Error>, overrides: Partial<LtaClientOptions> = {}) {
  let time = 0;
  const queue = [...responses];
  const fetch = vi.fn((_url: string | URL | Request, _init?: RequestInit) => {
    const next = queue.shift();
    if (!next) throw new Error('No more fake responses');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const sleep = vi.fn(() => Promise.resolve());
  const breaker = new CircuitBreaker({ now: () => time });
  const client = createLtaClient({
    accountKey: 'test-key',
    baseUrl: `${BASE_URL}/`,
    fetch,
    sleep,
    random: () => 0.5,
    breaker,
    ...overrides,
  });
  return { client, fetch, sleep, breaker, advance: (ms: number) => (time += ms) };
}

async function ltaErrorFrom(promise: Promise<unknown>): Promise<LtaError> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(LtaError);
  return err as LtaError;
}

const timeoutError = () => Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' });

describe('getBusArrival', () => {
  it('calls Bus Arrival v3 with the account key and parses the response', async () => {
    const { client, fetch } = setup([jsonResponse(ltaFixture('bus-arrival-83139-day'))]);

    const result = await client.getBusArrival('83139');

    expect(result.BusStopCode).toBe('83139');
    expect(result.Services.length).toBeGreaterThan(0);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/v3/BusArrival?BusStopCode=83139`);
    expect(init?.headers).toEqual({ AccountKey: 'test-key', accept: 'application/json' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('passes the optional service number', async () => {
    const { client, fetch } = setup([jsonResponse(ltaFixture('bus-arrival-night'))]);

    await client.getBusArrival('83139', '15');

    expect(fetch.mock.calls[0]![0]).toBe(`${BASE_URL}/v3/BusArrival?BusStopCode=83139&ServiceNo=15`);
  });

  it('accepts an empty Services list (no buses running)', async () => {
    const { client } = setup([jsonResponse(ltaFixture('bus-arrival-night'))]);

    await expect(client.getBusArrival('83139')).resolves.toMatchObject({ Services: [] });
  });

  it('refuses to call LTA without an account key', async () => {
    const { client, fetch } = setup([], { accountKey: '' });

    const err = await ltaErrorFrom(client.getBusArrival('83139'));

    expect(err.kind).toBe('not_configured');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('retries', () => {
  it('retries once after a 5xx, waiting 200-500 ms', async () => {
    const { client, fetch, sleep } = setup([
      jsonResponse({}, 503),
      jsonResponse(ltaFixture('bus-arrival-83139-day')),
    ]);

    await expect(client.getBusArrival('83139')).resolves.toMatchObject({ BusStopCode: '83139' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(350);
  });

  it('retries once after a network error', async () => {
    const { client, fetch } = setup([
      new TypeError('fetch failed'),
      jsonResponse(ltaFixture('bus-arrival-night')),
    ]);

    await client.getBusArrival('83139');

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after the second failure', async () => {
    const { client, fetch } = setup([jsonResponse({}, 500), jsonResponse({}, 502)]);

    const err = await ltaErrorFrom(client.getBusArrival('83139'));

    expect(err).toMatchObject({ kind: 'http', status: 502 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 4xx', async () => {
    const { client, fetch } = setup([jsonResponse({}, 401)]);

    const err = await ltaErrorFrom(client.getBusArrival('83139'));

    expect(err).toMatchObject({ kind: 'http', status: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('failure modes', () => {
  it('reports a timeout', async () => {
    const { client } = setup([timeoutError(), timeoutError()]);

    const err = await ltaErrorFrom(client.getBusArrival('83139'));

    expect(err.kind).toBe('timeout');
  });

  it('aborts a request that takes longer than the timeout', async () => {
    const hangingFetch = (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () =>
          reject(signal.reason instanceof Error ? signal.reason : new Error('aborted')),
        );
      });
    const client = createLtaClient({
      accountKey: 'test-key',
      baseUrl: BASE_URL,
      timeoutMs: 20,
      fetch: hangingFetch,
      sleep: () => Promise.resolve(),
    });

    const err = await ltaErrorFrom(client.getBusArrival('83139'));

    expect(err.kind).toBe('timeout');
  });

  it('treats a non-JSON body as invalid and does not retry', async () => {
    const { client, fetch } = setup([new Response('<html>Maintenance</html>', { status: 200 })]);

    const err = await ltaErrorFrom(client.getBusArrival('83139'));

    expect(err.kind).toBe('invalid_response');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('treats an unexpected shape as invalid', async () => {
    const { client } = setup([jsonResponse({ BusStopCode: '83139', Services: [{ ServiceNo: 15 }] })]);

    const err = await ltaErrorFrom(client.getBusArrival('83139'));

    expect(err.kind).toBe('invalid_response');
  });
});

describe('circuit breaker', () => {
  it('opens after 5 failed requests and stops calling LTA', async () => {
    const { client, fetch, breaker } = setup(Array.from({ length: 5 }, () => jsonResponse({}, 400)));

    for (let i = 0; i < 5; i += 1) await ltaErrorFrom(client.getBusArrival('83139'));
    const err = await ltaErrorFrom(client.getBusArrival('83139'));

    expect(err.kind).toBe('circuit_open');
    expect(breaker.state).toBe('open');
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('pauses for 60 s after LTA answers 429', async () => {
    const { client, fetch, breaker, advance } = setup([
      jsonResponse({}, 429),
      jsonResponse(ltaFixture('bus-arrival-night')),
    ]);

    expect((await ltaErrorFrom(client.getBusArrival('83139'))).kind).toBe('rate_limited');
    expect(breaker.state).toBe('open');

    advance(59_999);
    expect((await ltaErrorFrom(client.getBusArrival('83139'))).kind).toBe('circuit_open');

    advance(1);
    await expect(client.getBusArrival('83139')).resolves.toMatchObject({ Services: [] });
    expect(breaker.state).toBe('closed');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('getAllBusStops', () => {
  const stop = (n: number) => ({
    BusStopCode: String(n).padStart(5, '0'),
    RoadName: 'Victoria St',
    Description: `Stop ${n}`,
    Latitude: 1.3,
    Longitude: 103.8,
  });

  it('pages through BusStops with $skip until a short page', async () => {
    const full = Array.from({ length: LTA_PAGE_SIZE }, (_, i) => stop(i));
    const last = Array.from({ length: 120 }, (_, i) => stop(LTA_PAGE_SIZE + i));
    const { client, fetch } = setup([jsonResponse({ value: full }), jsonResponse({ value: last })]);

    const stops = await client.getAllBusStops();

    expect(stops).toHaveLength(620);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      `${BASE_URL}/BusStops?$skip=0`,
      `${BASE_URL}/BusStops?$skip=500`,
    ]);
  });

  it('parses the recorded first page', async () => {
    const { client } = setup([jsonResponse(ltaFixture('bus-stops-first-page'))]);

    const stops = await client.getAllBusStops();

    expect(stops[0]).toMatchObject({ BusStopCode: '01012', Description: 'Hotel Grand Pacific' });
  });

  it('stops if LTA keeps returning full pages', async () => {
    const full = { value: Array.from({ length: LTA_PAGE_SIZE }, (_, i) => stop(i)) };
    const { client } = setup(Array.from({ length: 40 }, () => jsonResponse(full)));

    const err = await ltaErrorFrom(client.getAllBusStops());

    expect(err.kind).toBe('invalid_response');
  });
});
