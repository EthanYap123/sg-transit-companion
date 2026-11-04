/** Typed client for the API in docs/API.md. The browser calls the API directly. */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

export interface Stop {
  code: string;
  description: string;
  roadName: string;
  latitude: number;
  longitude: number;
}

export type BusLoad = 'SEATS_AVAILABLE' | 'STANDING_AVAILABLE' | 'LIMITED_STANDING';
export type BusType = 'SINGLE_DECK' | 'DOUBLE_DECK' | 'BENDY';

export interface Bus {
  estimatedArrival: string;
  minutesAway: number;
  monitored: boolean;
  load: BusLoad | null;
  wheelchairAccessible: boolean;
  type: BusType | null;
  visitNumber: number;
  originCode: string;
  destinationCode: string;
}

export interface ServiceArrivals {
  serviceNo: string;
  operator: string;
  buses: Bus[];
}

export interface StopArrivals {
  stopCode: string;
  fetchedAt: string;
  stale: boolean;
  source: 'lta' | 'cache' | 'stale';
  services: ServiceArrivals[];
}

/** `NETWORK` means no answer at all; `UNKNOWN` means an answer that is not the API's error shape. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError(0, 'NETWORK', 'Could not reach the server');
  }
  if (res.ok) return (await res.json()) as T;

  const body = (await res.json().catch(() => null)) as {
    error?: { code?: string; message?: string };
  } | null;
  throw new ApiError(
    res.status,
    body?.error?.code ?? 'UNKNOWN',
    body?.error?.message ?? `The server answered ${res.status}`,
  );
}

export async function searchStops(query: string, signal?: AbortSignal): Promise<Stop[]> {
  const params = new URLSearchParams({ q: query });
  const { results } = await get<{ results: Stop[] }>(`/v1/stops/search?${params.toString()}`, signal);
  return results;
}

export function getStop(code: string, signal?: AbortSignal): Promise<Stop> {
  return get<Stop>(`/v1/stops/${encodeURIComponent(code)}`, signal);
}

export function getArrivals(code: string, signal?: AbortSignal): Promise<StopArrivals> {
  return get<StopArrivals>(`/v1/stops/${encodeURIComponent(code)}/arrivals`, signal);
}
