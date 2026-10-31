import type { z } from 'zod';
import { CircuitBreaker } from './circuit-breaker.js';
import { LtaError } from './errors.js';
import {
  ltaBusArrivalSchema,
  ltaBusStopsPageSchema,
  type LtaBusArrival,
  type LtaBusStop,
} from './schemas.js';

/** LTA returns at most this many records per call for bulk datasets such as BusStops. */
export const LTA_PAGE_SIZE = 500;
const MAX_PAGES = 40;

export interface LtaClientOptions {
  accountKey: string;
  baseUrl: string;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** How long to stop calling LTA after it answers HTTP 429. */
  rateLimitOpenMs?: number;
  breaker?: CircuitBreaker;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface LtaClient {
  readonly breaker: CircuitBreaker;
  getBusArrival(busStopCode: string, serviceNo?: string): Promise<LtaBusArrival>;
  getAllBusStops(): Promise<LtaBusStop[]>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createLtaClient(options: LtaClientOptions): LtaClient {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const rateLimitOpenMs = options.rateLimitOpenMs ?? 60_000;
  const breaker = options.breaker ?? new CircuitBreaker();
  const doFetch = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  async function attempt<T>(url: string, schema: z.ZodType<T>): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(url, {
        headers: { AccountKey: options.accountKey, accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new LtaError('timeout', `LTA did not answer within ${timeoutMs} ms`, { cause: err });
      }
      throw new LtaError('network', 'Could not reach LTA', { cause: err });
    }

    if (res.status === 429)
      throw new LtaError('rate_limited', 'LTA is rate limiting requests', { status: 429 });
    if (!res.ok) throw new LtaError('http', `LTA answered HTTP ${res.status}`, { status: res.status });

    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      throw new LtaError('invalid_response', 'LTA response was not JSON', { cause: err });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new LtaError('invalid_response', 'LTA response did not match the expected shape', {
        cause: parsed.error,
      });
    }
    return parsed.data;
  }

  async function request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    if (!options.accountKey) throw new LtaError('not_configured', 'LTA_ACCOUNT_KEY is not set');
    if (!breaker.tryAcquire())
      throw new LtaError('circuit_open', 'LTA calls are paused after repeated failures');

    const url = `${baseUrl}${path}`;
    try {
      let result: T;
      try {
        result = await attempt(url, schema);
      } catch (err) {
        if (!(err instanceof LtaError) || !err.retryable) throw err;
        await sleep(200 + Math.floor(random() * 300));
        result = await attempt(url, schema);
      }
      breaker.recordSuccess();
      return result;
    } catch (err) {
      if (err instanceof LtaError && err.kind === 'rate_limited') breaker.trip(rateLimitOpenMs);
      else breaker.recordFailure();
      throw err;
    }
  }

  return {
    breaker,

    getBusArrival(busStopCode, serviceNo) {
      const params = new URLSearchParams({ BusStopCode: busStopCode });
      if (serviceNo) params.set('ServiceNo', serviceNo);
      return request(`/v3/BusArrival?${params.toString()}`, ltaBusArrivalSchema);
    },

    async getAllBusStops() {
      const stops: LtaBusStop[] = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const skip = page * LTA_PAGE_SIZE;
        const { value } = await request(`/BusStops?$skip=${skip}`, ltaBusStopsPageSchema);
        stops.push(...value);
        if (value.length < LTA_PAGE_SIZE) return stops;
      }
      throw new LtaError('invalid_response', `BusStops had more than ${MAX_PAGES} pages`);
    },
  };
}
