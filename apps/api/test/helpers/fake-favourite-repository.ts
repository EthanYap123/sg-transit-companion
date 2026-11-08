import { randomUUID } from 'node:crypto';
import type { ApiIdentity } from '../../src/auth/api-token.js';
import {
  DuplicateFavouriteError,
  FavouriteLimitError,
  FavouriteOrderError,
  UnknownStopError,
  type Favourite,
  type FavouriteRepository,
} from '../../src/favourites/favourite-repository.js';
import type { Stop } from '../../src/stops/stop.js';

interface Row extends Favourite {
  owner: string;
}

/** In-memory FavouriteRepository with the same rules as the Prisma one. */
export class FakeFavouriteRepository implements FavouriteRepository {
  rows: Row[] = [];

  constructor(private readonly stops: Map<string, Stop>) {}

  private mine(owner: string): Row[] {
    return this.rows.filter((row) => row.owner === owner).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private strip({ owner: _owner, ...favourite }: Row): Favourite {
    return favourite;
  }

  list(authSubject: string): Promise<Favourite[]> {
    return Promise.resolve(this.mine(authSubject).map((row) => this.strip(row)));
  }

  add(identity: ApiIdentity, busStopCode: string, label: string | null, limit: number): Promise<Favourite> {
    const mine = this.mine(identity.authSubject);
    const stop = this.stops.get(busStopCode);
    if (!stop) return Promise.reject(new UnknownStopError(`No bus stop with code ${busStopCode}`));
    if (mine.length >= limit) return Promise.reject(new FavouriteLimitError(limit));
    if (mine.some((row) => row.stop.code === busStopCode)) {
      return Promise.reject(new DuplicateFavouriteError('This stop is already saved'));
    }
    const row: Row = {
      id: randomUUID(),
      owner: identity.authSubject,
      label,
      sortOrder: mine.length,
      stop,
    };
    this.rows.push(row);
    return Promise.resolve(this.strip(row));
  }

  rename(authSubject: string, id: string, label: string | null): Promise<Favourite | null> {
    const row = this.mine(authSubject).find((r) => r.id === id);
    if (!row) return Promise.resolve(null);
    row.label = label;
    return Promise.resolve(this.strip(row));
  }

  reorder(authSubject: string, ids: string[]): Promise<Favourite[]> {
    const mine = this.mine(authSubject);
    const owned = new Set(mine.map((row) => row.id));
    if (ids.length !== owned.size || new Set(ids).size !== ids.length || !ids.every((id) => owned.has(id))) {
      return Promise.reject(new FavouriteOrderError('List every saved stop exactly once'));
    }
    for (const row of mine) row.sortOrder = ids.indexOf(row.id);
    return this.list(authSubject);
  }

  remove(authSubject: string, id: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => !(row.owner === authSubject && row.id === id));
    return Promise.resolve(this.rows.length < before);
  }
}
