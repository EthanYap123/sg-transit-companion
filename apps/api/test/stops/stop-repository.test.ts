import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../src/db.js';
import type { Stop } from '../../src/stops/stop.js';
import { PrismaStopRepository } from '../../src/stops/stop-repository.js';

/**
 * Runs against a real, migrated Postgres when TEST_DATABASE_URL is set (CI service container, or the
 * sg_transit_test database in Docker Compose). Tables are emptied first, so never point it at real data.
 */
const url = process.env.TEST_DATABASE_URL;

const stop = (code: string, description: string): Stop => ({
  code,
  description,
  roadName: 'Victoria St',
  latitude: 1.29684825487647,
  longitude: 103.85253591654006,
});

describe.skipIf(!url)('PrismaStopRepository against Postgres', () => {
  const prisma = createPrismaClient(url ?? '');
  const repo = new PrismaStopRepository(prisma);

  beforeEach(async () => {
    await prisma.stopSyncRun.deleteMany();
    await prisma.busStop.deleteMany();
  });
  afterAll(() => prisma.$disconnect());

  it('returns nothing before the first sync', async () => {
    expect(await repo.findCurrent()).toEqual([]);
  });

  it('inserts stops in one statement and reads them back exactly', async () => {
    await repo.upsertAll(
      [stop('01012', 'Hotel Grand Pacific'), stop('01013', "St. Joseph's Ch")],
      new Date(),
    );

    expect(await repo.findCurrent()).toEqual([
      stop('01012', 'Hotel Grand Pacific'),
      stop('01013', "St. Joseph's Ch"),
    ]);
  });

  it('updates changed stops and keeps dropped ones out of the current list', async () => {
    await repo.upsertAll([stop('01012', 'Old name'), stop('01013', 'Dropped later')], new Date('2026-10-01'));
    await repo.upsertAll([stop('01012', 'New name')], new Date('2026-11-01'));

    expect(await repo.findCurrent()).toEqual([stop('01012', 'New name')]);
    expect(await prisma.busStop.count()).toBe(2);
  });

  it('handles a full-size sync', async () => {
    const stops = Array.from({ length: 5_300 }, (_, i) => stop(String(i).padStart(5, '0'), `Stop ${i}`));

    await repo.upsertAll(stops, new Date());

    expect(await repo.findCurrent()).toHaveLength(5_300);
  });

  it('records sync runs', async () => {
    const id = await repo.startRun();
    expect(await prisma.stopSyncRun.findUnique({ where: { id } })).toMatchObject({ status: 'running' });

    await repo.finishRun(id, { status: 'failed', recordCount: 0, error: 'LTA did not answer' });

    const run = await prisma.stopSyncRun.findUniqueOrThrow({ where: { id } });
    expect(run).toMatchObject({ status: 'failed', recordCount: 0, error: 'LTA did not answer' });
    expect(run.finishedAt).toBeInstanceOf(Date);
  });
});
