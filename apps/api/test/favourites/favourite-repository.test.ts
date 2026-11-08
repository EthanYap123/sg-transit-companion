import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../src/db.js';
import {
  DuplicateFavouriteError,
  FavouriteLimitError,
  FavouriteOrderError,
  PrismaFavouriteRepository,
  UnknownStopError,
} from '../../src/favourites/favourite-repository.js';
import { PrismaStopRepository } from '../../src/stops/stop-repository.js';
import { PrismaUserRepository } from '../../src/users/user-repository.js';

/** Runs against a real, migrated Postgres when TEST_DATABASE_URL is set (see stop-repository.test.ts). */
const url = process.env.TEST_DATABASE_URL;

const identity = (authSubject: string) => ({ authSubject, name: 'Ethan', email: null, imageUrl: null });
const stop = (code: string) => ({
  code,
  description: `Stop ${code}`,
  roadName: 'Victoria St',
  latitude: 1.3,
  longitude: 103.8,
});

describe.skipIf(!url)('PrismaFavouriteRepository against Postgres', () => {
  const prisma = createPrismaClient(url ?? '');
  const repo = new PrismaFavouriteRepository(prisma);

  beforeEach(async () => {
    await prisma.favouriteStop.deleteMany();
    await prisma.user.deleteMany();
    await prisma.busStop.deleteMany();
    await new PrismaStopRepository(prisma).upsertAll(['10000', '10001', '10002'].map(stop), new Date());
  });
  afterAll(() => prisma.$disconnect());

  it('creates the user on first save and lists favourites in order with stop details', async () => {
    await repo.add(identity('google:1'), '10001', 'Home', 20);
    await repo.add(identity('google:1'), '10000', null, 20);

    const list = await repo.list('google:1');

    expect(list.map((f) => [f.stop.code, f.label, f.sortOrder])).toEqual([
      ['10001', 'Home', 0],
      ['10000', null, 1],
    ]);
    expect(list[0]?.stop).toEqual(stop('10001'));
    expect(await prisma.user.count()).toBe(1);
  });

  it('rejects a duplicate, an unknown stop and a full list with clear errors', async () => {
    await repo.add(identity('google:1'), '10000', null, 2);

    await expect(repo.add(identity('google:1'), '10000', null, 2)).rejects.toBeInstanceOf(
      DuplicateFavouriteError,
    );
    await expect(repo.add(identity('google:1'), '12345', null, 2)).rejects.toBeInstanceOf(UnknownStopError);
    await repo.add(identity('google:1'), '10001', null, 2);
    await expect(repo.add(identity('google:1'), '10002', null, 2)).rejects.toBeInstanceOf(
      FavouriteLimitError,
    );
    expect(await prisma.favouriteStop.count()).toBe(2);
  });

  it('renames and removes only the owner’s favourite', async () => {
    const mine = await repo.add(identity('google:1'), '10000', 'Home', 20);

    expect(await repo.rename('google:2', mine.id, 'Stolen')).toBeNull();
    expect(await repo.remove('google:2', mine.id)).toBe(false);
    expect((await repo.rename('google:1', mine.id, 'Work'))?.label).toBe('Work');
    expect(await repo.remove('google:1', mine.id)).toBe(true);
    expect(await repo.list('google:1')).toEqual([]);
  });

  it('reorders, and refuses a list that is not exactly the user’s favourites', async () => {
    const a = await repo.add(identity('google:1'), '10000', null, 20);
    const b = await repo.add(identity('google:1'), '10001', null, 20);
    const theirs = await repo.add(identity('google:2'), '10002', null, 20);

    const reordered = await repo.reorder('google:1', [b.id, a.id]);

    expect(reordered.map((f) => f.id)).toEqual([b.id, a.id]);
    await expect(repo.reorder('google:1', [b.id, theirs.id])).rejects.toBeInstanceOf(FavouriteOrderError);
    await expect(repo.reorder('google:1', [b.id])).rejects.toBeInstanceOf(FavouriteOrderError);
  });

  it('deletes a user’s favourites with their account', async () => {
    await repo.add(identity('google:1'), '10000', null, 20);
    await repo.add(identity('google:2'), '10000', null, 20);

    await new PrismaUserRepository(prisma).deleteBySubject('google:1');

    expect(await repo.list('google:1')).toEqual([]);
    expect(await repo.list('google:2')).toHaveLength(1);
  });

  it('never deletes a stop someone has saved', async () => {
    await repo.add(identity('google:1'), '10000', null, 20);

    await expect(prisma.busStop.delete({ where: { code: '10000' } })).rejects.toThrow();
  });
});
