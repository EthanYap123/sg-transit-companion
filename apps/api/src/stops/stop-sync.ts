import type { CacheStore } from '../cache/store.js';
import type { LtaClient } from '../lta/client.js';
import { stopsFromLta, type Stop } from './stop.js';
import type { StopIndex } from './stop-index.js';
import type { StopRepository } from './stop-repository.js';

export const STOPS_SNAPSHOT_KEY = 'stops:v1';

/** A sync is already running; only one runs at a time. */
export class SyncInProgressError extends Error {
  constructor() {
    super('A bus stop sync is already running');
    this.name = 'SyncInProgressError';
  }
}

export interface SyncResult {
  runId: string;
  recordCount: number;
  durationMs: number;
}

export type IndexSource = 'redis' | 'postgres' | 'lta' | 'none';

export interface StopSyncServiceOptions {
  lta: Pick<LtaClient, 'getAllBusStops'>;
  repo: StopRepository;
  store: CacheStore | null;
  index: StopIndex;
  now?: () => number;
  /** Refuse a sync that returns fewer stops than this share of the current index (a bad LTA page). */
  minShareOfCurrent?: number;
  onError?: (err: unknown, context: string) => void;
}

type SnapshotRow = [code: string, description: string, roadName: string, latitude: number, longitude: number];

interface Snapshot {
  v: 1;
  syncedAt: string;
  stops: SnapshotRow[];
}

/**
 * Keeps the bus stop list in step with LTA: Postgres is the durable copy, Redis holds a compact
 * snapshot so a cold start needs one Redis read, and the in-memory index serves every search.
 */
export class StopSyncService {
  private readonly lta: Pick<LtaClient, 'getAllBusStops'>;
  private readonly repo: StopRepository;
  private readonly store: CacheStore | null;
  private readonly index: StopIndex;
  private readonly now: () => number;
  private readonly minShareOfCurrent: number;
  private readonly onError: (err: unknown, context: string) => void;
  private running = false;
  private lastSyncedAt: string | null = null;

  constructor(options: StopSyncServiceOptions) {
    this.lta = options.lta;
    this.repo = options.repo;
    this.store = options.store;
    this.index = options.index;
    this.now = options.now ?? Date.now;
    this.minShareOfCurrent = options.minShareOfCurrent ?? 0.5;
    this.onError = options.onError ?? (() => undefined);
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** When the stops in the index were last synced from LTA, if known. */
  get syncedAt(): string | null {
    return this.lastSyncedAt;
  }

  /** Records a run and starts the sync. Resolves once the run is recorded; `done` settles when it ends. */
  async start(): Promise<{ runId: string; done: Promise<SyncResult> }> {
    if (this.running) throw new SyncInProgressError();
    this.running = true;
    let runId: string;
    try {
      runId = await this.repo.startRun();
    } catch (err) {
      this.running = false;
      throw err;
    }
    const done = this.run(runId).finally(() => {
      this.running = false;
    });
    return { runId, done };
  }

  /** Loads the index at boot: Redis snapshot, else Postgres, else a fresh sync from LTA. */
  async loadIndex(): Promise<{ source: IndexSource; count: number }> {
    const fromRedis = await this.readSnapshot();
    if (fromRedis && fromRedis.stops.length > 0) {
      this.index.replace(fromRedis.stops);
      this.lastSyncedAt = fromRedis.syncedAt;
      return { source: 'redis', count: this.index.size };
    }

    try {
      const stops = await this.repo.findCurrent();
      if (stops.length > 0) {
        const syncedAt = new Date(this.now()).toISOString();
        this.index.replace(stops);
        await this.writeSnapshot(stops, syncedAt);
        return { source: 'postgres', count: this.index.size };
      }
    } catch (err) {
      this.onError(err, 'load stops from Postgres');
    }

    try {
      const { done } = await this.start();
      await done;
      return { source: 'lta', count: this.index.size };
    } catch (err) {
      this.onError(err, 'sync stops from LTA');
      return { source: 'none', count: this.index.size };
    }
  }

  private async run(runId: string): Promise<SyncResult> {
    const startedAt = this.now();
    try {
      const stops = stopsFromLta(await this.lta.getAllBusStops());
      const minimum = Math.max(1, Math.floor(this.index.size * this.minShareOfCurrent));
      if (stops.length < minimum) {
        throw new Error(`LTA returned ${stops.length} stops, fewer than the ${minimum} expected`);
      }
      const syncedAt = new Date(this.now());
      await this.repo.upsertAll(stops, syncedAt);
      this.index.replace(stops);
      this.lastSyncedAt = syncedAt.toISOString();
      await this.writeSnapshot(stops, this.lastSyncedAt);
      await this.repo.finishRun(runId, { status: 'ok', recordCount: stops.length });
      return { runId, recordCount: stops.length, durationMs: this.now() - startedAt };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.repo
        .finishRun(runId, { status: 'failed', recordCount: 0, error: message })
        .catch((e: unknown) => this.onError(e, 'record failed sync'));
      throw err;
    }
  }

  private async readSnapshot(): Promise<{ stops: Stop[]; syncedAt: string } | null> {
    if (!this.store) return null;
    try {
      const raw = await this.store.get(STOPS_SNAPSHOT_KEY);
      if (!raw) return null;
      const snapshot = JSON.parse(raw) as Partial<Snapshot>;
      if (snapshot.v !== 1 || !Array.isArray(snapshot.stops) || typeof snapshot.syncedAt !== 'string')
        return null;
      const stops = snapshot.stops.map(([code, description, roadName, latitude, longitude]) => ({
        code,
        description,
        roadName,
        latitude,
        longitude,
      }));
      return { stops, syncedAt: snapshot.syncedAt };
    } catch (err) {
      this.onError(err, 'read stop snapshot');
      return null;
    }
  }

  private async writeSnapshot(stops: Stop[], syncedAt: string): Promise<void> {
    if (!this.store) return;
    const snapshot: Snapshot = {
      v: 1,
      syncedAt,
      stops: stops.map((s) => [s.code, s.description, s.roadName, s.latitude, s.longitude]),
    };
    try {
      await this.store.set(STOPS_SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch (err) {
      this.onError(err, 'write stop snapshot');
    }
  }
}
