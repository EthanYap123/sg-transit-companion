import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../src/db.js';
import { PrismaUserRepository } from '../../src/users/user-repository.js';

/** Runs against a real, migrated Postgres when TEST_DATABASE_URL is set (see stop-repository.test.ts). */
const url = process.env.TEST_DATABASE_URL;

const identity = (authSubject: string, name = 'Ethan') => ({
  authSubject,
  name,
  email: 'ethan@example.com',
  imageUrl: 'https://lh3.googleusercontent.com/a/1',
});

describe.skipIf(!url)('PrismaUserRepository against Postgres', () => {
  const prisma = createPrismaClient(url ?? '');
  const repo = new PrismaUserRepository(prisma);

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });
  afterAll(() => prisma.$disconnect());

  it('creates a user and returns only public fields', async () => {
    const user = await repo.upsert(identity('google:1'));

    expect(user).toEqual({
      id: expect.any(String) as string,
      name: 'Ethan',
      imageUrl: 'https://lh3.googleusercontent.com/a/1',
      createdAt: expect.any(Date) as Date,
    });
    expect(await prisma.user.findUnique({ where: { authSubject: 'google:1' } })).toMatchObject({
      email: 'ethan@example.com',
    });
  });

  it('updates the same row on later calls and moves last seen forward', async () => {
    const first = await repo.upsert(identity('google:1', 'Old'));
    const before = await prisma.user.findUniqueOrThrow({ where: { id: first.id } });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = await repo.upsert(identity('google:1', 'New'));

    expect(second).toMatchObject({ id: first.id, name: 'New', createdAt: first.createdAt });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: first.id } });
    expect(after.lastSeenAt.getTime()).toBeGreaterThan(before.lastSeenAt.getTime());
    expect(await prisma.user.count()).toBe(1);
  });

  it('survives two first calls at the same moment', async () => {
    const users = await Promise.all([repo.upsert(identity('google:1')), repo.upsert(identity('google:1'))]);

    expect(users[0].id).toBe(users[1].id);
    expect(await prisma.user.count()).toBe(1);
  });

  it('deletes only the given user, and is safe to repeat', async () => {
    await repo.upsert(identity('google:1'));
    await repo.upsert(identity('google:2'));

    await repo.deleteBySubject('google:1');
    await repo.deleteBySubject('google:1');

    const left = await prisma.user.findMany({ select: { authSubject: true } });
    expect(left).toEqual([{ authSubject: 'google:2' }]);
  });
});
