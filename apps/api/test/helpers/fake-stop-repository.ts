import type { Stop } from '../../src/stops/stop.js';
import type { StopRepository, SyncRunResult } from '../../src/stops/stop-repository.js';

/** In-memory StopRepository for unit tests. */
export class FakeStopRepository implements StopRepository {
  stops = new Map<string, Stop & { syncedAt: Date }>();
  runs = new Map<string, SyncRunResult | 'running'>();
  failFind = false;

  findCurrent(): Promise<Stop[]> {
    if (this.failFind) return Promise.reject(new Error('database unavailable'));
    const all = [...this.stops.values()];
    const latest = Math.max(0, ...all.map((s) => s.syncedAt.getTime()));
    return Promise.resolve(
      all.filter((s) => s.syncedAt.getTime() === latest).map(({ syncedAt: _syncedAt, ...stop }) => stop),
    );
  }

  upsertAll(stops: Stop[], syncedAt: Date): Promise<void> {
    for (const stop of stops) this.stops.set(stop.code, { ...stop, syncedAt });
    return Promise.resolve();
  }

  startRun(): Promise<string> {
    const id = `run-${this.runs.size + 1}`;
    this.runs.set(id, 'running');
    return Promise.resolve(id);
  }

  finishRun(id: string, result: SyncRunResult): Promise<void> {
    this.runs.set(id, result);
    return Promise.resolve();
  }
}
