import type { CommandBudget } from '../cache/command-budget.js';
import type { CacheStore } from '../cache/store.js';
import type { LtaClient } from '../lta/client.js';
import { LtaError } from '../lta/errors.js';
import { normaliseArrivals, type StopArrivals } from './normalise.js';

export type ArrivalsSource = 'lta' | 'cache' | 'stale';

export interface ArrivalsResult extends StopArrivals {
  /** True when LTA failed and this is the last known data, up to 10 minutes old. */
  stale: boolean;
  source: ArrivalsSource;
}

/** LTA failed and there is nothing recent enough to fall back on. */
export class ArrivalsUnavailableError extends Error {
  constructor(readonly ltaError: LtaError) {
    super(`Live arrivals unavailable: ${ltaError.message}`, { cause: ltaError });
    this.name = 'ArrivalsUnavailableError';
  }
}

export interface ArrivalsServiceOptions {
  lta: Pick<LtaClient, 'getBusArrival'>;
  /** Redis. Null when it is not configured; the service then works from memory only. */
  store: CacheStore | null;
  budget: CommandBudget;
  now?: () => number;
  /** LTA updates Bus Arrival every 20 s, so data younger than this is served without calling LTA. */
  freshMs?: number;
  /** Oldest data still shown (flagged stale) when LTA is down. */
  staleMs?: number;
  /** Write each stop's snapshot to Redis at most this often. */
  snapshotEveryMs?: number;
  /** In-memory entries kept (least recently used are dropped first). */
  maxEntries?: number;
  onStoreError?: (err: unknown) => void;
}

interface Entry {
  data: StopArrivals;
  fetchedAtMs: number;
}

/**
 * Two-level arrivals cache (ADR 0001): memory first, Redis only for data that should survive a
 * restart, LTA at most once per stop per 20 s, and stale data when LTA is down.
 */
export class ArrivalsService {
  private readonly lta: Pick<LtaClient, 'getBusArrival'>;
  private readonly store: CacheStore | null;
  private readonly budget: CommandBudget;
  private readonly now: () => number;
  private readonly freshMs: number;
  private readonly staleMs: number;
  private readonly snapshotEveryMs: number;
  private readonly maxEntries: number;
  private readonly onStoreError: (err: unknown) => void;

  private readonly memory = new Map<string, Entry>();
  private readonly inFlight = new Map<string, Promise<Entry>>();
  private readonly lastSnapshotAt = new Map<string, number>();
  /** Stops whose Redis snapshot has been read since this process started. */
  private readonly snapshotChecked = new Set<string>();

  constructor(options: ArrivalsServiceOptions) {
    this.lta = options.lta;
    this.store = options.store;
    this.budget = options.budget;
    this.now = options.now ?? Date.now;
    this.freshMs = options.freshMs ?? 20_000;
    this.staleMs = options.staleMs ?? 10 * 60_000;
    this.snapshotEveryMs = options.snapshotEveryMs ?? 60_000;
    this.maxEntries = options.maxEntries ?? 2_000;
    this.onStoreError = options.onStoreError ?? (() => undefined);
  }

  async getArrivals(stopCode: string): Promise<ArrivalsResult> {
    const cached = this.fromMemory(stopCode);
    if (cached && this.age(cached) < this.freshMs) return this.result(cached, 'lta');

    let snapshotReadNow = false;
    if (!cached && !this.snapshotChecked.has(stopCode)) {
      this.snapshotChecked.add(stopCode);
      snapshotReadNow = true;
      const snapshot = await this.readSnapshot(stopCode);
      if (snapshot) {
        this.remember(stopCode, snapshot);
        if (this.age(snapshot) < this.freshMs) return this.result(snapshot, 'cache');
      }
    }

    try {
      return this.result(await this.fetchShared(stopCode), 'lta');
    } catch (err) {
      if (!(err instanceof LtaError)) throw err;
      const fallback =
        this.fromMemory(stopCode) ?? (snapshotReadNow ? null : await this.readSnapshot(stopCode));
      if (fallback && this.age(fallback) < this.staleMs)
        return { ...fallback.data, stale: true, source: 'stale' };
      throw new ArrivalsUnavailableError(err);
    }
  }

  /** Concurrent requests for the same stop share one LTA call. */
  private fetchShared(stopCode: string): Promise<Entry> {
    const existing = this.inFlight.get(stopCode);
    if (existing) return existing;

    const request = (async () => {
      const raw = await this.lta.getBusArrival(stopCode);
      const fetchedAtMs = this.now();
      const entry = { data: normaliseArrivals(raw, new Date(fetchedAtMs)), fetchedAtMs };
      this.remember(stopCode, entry);
      this.writeSnapshot(stopCode, entry);
      return entry;
    })().finally(() => this.inFlight.delete(stopCode));

    this.inFlight.set(stopCode, request);
    return request;
  }

  private result(entry: Entry, source: ArrivalsSource): ArrivalsResult {
    return { ...entry.data, stale: false, source };
  }

  private age(entry: Entry): number {
    return this.now() - entry.fetchedAtMs;
  }

  private fromMemory(stopCode: string): Entry | undefined {
    const entry = this.memory.get(stopCode);
    if (entry) {
      // Re-insert so Map order tracks recent use (least recently used first).
      this.memory.delete(stopCode);
      this.memory.set(stopCode, entry);
    }
    return entry;
  }

  private remember(stopCode: string, entry: Entry): void {
    this.memory.delete(stopCode);
    this.memory.set(stopCode, entry);
    while (this.memory.size > this.maxEntries) {
      const oldest = this.memory.keys().next().value;
      if (oldest === undefined) break;
      this.memory.delete(oldest);
    }
  }

  private async readSnapshot(stopCode: string): Promise<Entry | null> {
    if (!this.store || !this.budget.allow(1)) return null;
    try {
      const raw = await this.store.get(snapshotKey(stopCode));
      return raw ? parseSnapshot(raw) : null;
    } catch (err) {
      this.onStoreError(err);
      return null;
    }
  }

  private writeSnapshot(stopCode: string, entry: Entry): void {
    if (!this.store) return;
    const last = this.lastSnapshotAt.get(stopCode);
    if (last !== undefined && entry.fetchedAtMs - last < this.snapshotEveryMs) return;
    if (!this.budget.allow(1)) return;
    this.lastSnapshotAt.set(stopCode, entry.fetchedAtMs);
    this.store
      .set(snapshotKey(stopCode), JSON.stringify(entry), Math.ceil(this.staleMs / 1000))
      .catch((err: unknown) => this.onStoreError(err));
  }
}

function snapshotKey(stopCode: string): string {
  return `arr:${stopCode}`;
}

function parseSnapshot(raw: string): Entry | null {
  try {
    const value = JSON.parse(raw) as Partial<Entry>;
    if (typeof value.fetchedAtMs !== 'number' || !Array.isArray(value.data?.services)) return null;
    return value as Entry;
  } catch {
    return null;
  }
}
