import type { ApiIdentity } from '../auth/api-token.js';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type { Stop } from '../stops/stop.js';

export interface Favourite {
  id: string;
  label: string | null;
  sortOrder: number;
  stop: Stop;
}

/** The user already saved this stop. */
export class DuplicateFavouriteError extends Error {}
/** The user has reached the most favourites allowed. */
export class FavouriteLimitError extends Error {
  constructor(readonly limit: number) {
    super(`You can save up to ${limit} stops`);
  }
}
/** No bus stop has this code. */
export class UnknownStopError extends Error {}
/** A reorder did not list exactly the user's favourites. */
export class FavouriteOrderError extends Error {}

export interface FavouriteRepository {
  list(authSubject: string): Promise<Favourite[]>;
  /** Creates the user on first save, then adds the stop at the end of their list. */
  add(identity: ApiIdentity, busStopCode: string, label: string | null, limit: number): Promise<Favourite>;
  /** Returns null when the user has no favourite with this id. */
  rename(authSubject: string, id: string, label: string | null): Promise<Favourite | null>;
  reorder(authSubject: string, ids: string[]): Promise<Favourite[]>;
  /** Returns false when the user has no favourite with this id. */
  remove(authSubject: string, id: string): Promise<boolean>;
}

const select = {
  id: true,
  label: true,
  sortOrder: true,
  busStop: { select: { code: true, description: true, roadName: true, latitude: true, longitude: true } },
} as const;

type Row = Prisma.FavouriteStopGetPayload<{ select: typeof select }>;

const toFavourite = ({ busStop, ...rest }: Row): Favourite => ({ ...rest, stop: busStop });

const order = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

function isPrismaError(err: unknown, code: string): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
}

/** Every query is scoped to the caller's own rows through `user.authSubject`. */
export class PrismaFavouriteRepository implements FavouriteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(authSubject: string): Promise<Favourite[]> {
    const rows = await this.prisma.favouriteStop.findMany({
      where: { user: { authSubject } },
      orderBy: order,
      select,
    });
    return rows.map(toFavourite);
  }

  async add(identity: ApiIdentity, busStopCode: string, label: string | null, limit: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.upsert({
          where: { authSubject: identity.authSubject },
          create: {
            authSubject: identity.authSubject,
            name: identity.name,
            email: identity.email,
            imageUrl: identity.imageUrl,
          },
          update: {},
          select: { id: true },
        });
        const existing = await tx.favouriteStop.aggregate({
          where: { userId: user.id },
          _count: true,
          _max: { sortOrder: true },
        });
        if (existing._count >= limit) throw new FavouriteLimitError(limit);
        const row = await tx.favouriteStop.create({
          data: {
            userId: user.id,
            busStopCode,
            label,
            sortOrder: (existing._max.sortOrder ?? -1) + 1,
          },
          select,
        });
        return toFavourite(row);
      });
    } catch (err) {
      if (isPrismaError(err, 'P2002')) throw new DuplicateFavouriteError('This stop is already saved');
      if (isPrismaError(err, 'P2003')) throw new UnknownStopError(`No bus stop with code ${busStopCode}`);
      throw err;
    }
  }

  async rename(authSubject: string, id: string, label: string | null): Promise<Favourite | null> {
    const { count } = await this.prisma.favouriteStop.updateMany({
      where: { id, user: { authSubject } },
      data: { label },
    });
    if (count === 0) return null;
    const row = await this.prisma.favouriteStop.findUniqueOrThrow({ where: { id }, select });
    return toFavourite(row);
  }

  async reorder(authSubject: string, ids: string[]): Promise<Favourite[]> {
    const rows = await this.prisma.$transaction(async (tx) => {
      const current = await tx.favouriteStop.findMany({
        where: { user: { authSubject } },
        select: { id: true },
      });
      const owned = new Set(current.map((row) => row.id));
      const sameSet =
        ids.length === owned.size && new Set(ids).size === ids.length && ids.every((id) => owned.has(id));
      if (!sameSet) throw new FavouriteOrderError('List every saved stop exactly once');
      for (const [sortOrder, id] of ids.entries()) {
        await tx.favouriteStop.update({ where: { id }, data: { sortOrder } });
      }
      return tx.favouriteStop.findMany({ where: { user: { authSubject } }, orderBy: order, select });
    });
    return rows.map(toFavourite);
  }

  async remove(authSubject: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.favouriteStop.deleteMany({ where: { id, user: { authSubject } } });
    return count > 0;
  }
}
