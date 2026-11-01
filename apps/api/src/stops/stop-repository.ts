import type { PrismaClient } from '../generated/prisma/client.js';
import type { Stop } from './stop.js';

export interface SyncRunResult {
  status: 'ok' | 'failed';
  recordCount: number;
  error?: string;
}

export interface StopRepository {
  /** Stops in the latest sync, i.e. those LTA still lists. */
  findCurrent(): Promise<Stop[]>;
  /** Inserts or updates every stop in one statement. Stops LTA dropped are kept for existing favourites. */
  upsertAll(stops: Stop[], syncedAt: Date): Promise<void>;
  startRun(): Promise<string>;
  finishRun(id: string, result: SyncRunResult): Promise<void>;
}

export class PrismaStopRepository implements StopRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findCurrent(): Promise<Stop[]> {
    const latest = await this.prisma.busStop.aggregate({ _max: { syncedAt: true } });
    const syncedAt = latest._max.syncedAt;
    if (!syncedAt) return [];
    return this.prisma.busStop.findMany({
      where: { syncedAt },
      select: { code: true, description: true, roadName: true, latitude: true, longitude: true },
      orderBy: { code: 'asc' },
    });
  }

  async upsertAll(stops: Stop[], syncedAt: Date): Promise<void> {
    if (stops.length === 0) return;
    await this.prisma.$executeRaw`
      INSERT INTO bus_stops (code, description, road_name, latitude, longitude, synced_at)
      SELECT t.code, t.description, t.road_name, t.latitude, t.longitude, ${syncedAt}::timestamptz
      FROM unnest(
        ${stops.map((s) => s.code)}::text[],
        ${stops.map((s) => s.description)}::text[],
        ${stops.map((s) => s.roadName)}::text[],
        ${stops.map((s) => s.latitude)}::float8[],
        ${stops.map((s) => s.longitude)}::float8[]
      ) AS t(code, description, road_name, latitude, longitude)
      ON CONFLICT (code) DO UPDATE SET
        description = EXCLUDED.description,
        road_name = EXCLUDED.road_name,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        synced_at = EXCLUDED.synced_at`;
  }

  async startRun(): Promise<string> {
    const run = await this.prisma.stopSyncRun.create({ data: {}, select: { id: true } });
    return run.id;
  }

  async finishRun(id: string, result: SyncRunResult): Promise<void> {
    await this.prisma.stopSyncRun.update({
      where: { id },
      data: {
        status: result.status,
        recordCount: result.recordCount,
        error: result.error ?? null,
        finishedAt: new Date(),
      },
    });
  }
}
