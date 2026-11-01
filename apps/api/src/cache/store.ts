import { Redis } from 'ioredis';

/** The few key-value operations the API needs. Keys are given without the environment prefix. */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  /** Adds to a counter and (re)sets its expiry. Returns the new value. */
  incrBy(key: string, by: number, ttlSeconds: number): Promise<number>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

/**
 * Redis-backed store (Upstash in staging/production, Docker locally). Every key gets the environment
 * prefix, so staging and production can share Upstash's single free database.
 * Fails fast instead of queueing commands while disconnected: Redis is optional at runtime.
 */
export class RedisStore implements CacheStore {
  private readonly client: Redis;

  constructor(
    url: string,
    private readonly prefix: string,
  ) {
    this.client = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
    });
    // Connection errors surface on the commands that fail; without a listener ioredis logs them loudly.
    this.client.on('error', () => undefined);
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  private key(key: string): string {
    return `${this.prefix}:${key}`;
  }

  get(key: string): Promise<string | null> {
    return this.client.get(this.key(key));
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) await this.client.set(this.key(key), value, 'EX', ttlSeconds);
    else await this.client.set(this.key(key), value);
  }

  async incrBy(key: string, by: number, ttlSeconds: number): Promise<number> {
    const results = await this.client
      .multi()
      .incrby(this.key(key), by)
      .expire(this.key(key), ttlSeconds)
      .exec();
    const [err, value] = results?.[0] ?? [new Error('Redis transaction was discarded'), null];
    if (err) throw err;
    return Number(value);
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

/** In-process store used by tests, and a stand-in shape for when Redis is not configured. */
export class MemoryStore implements CacheStore {
  private readonly data = new Map<string, { value: string; expiresAt: number | null }>();

  constructor(private readonly now: () => number = Date.now) {}

  private live(key: string) {
    const entry = this.data.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.live(key)?.value ?? null);
  }

  /** Seconds until the key expires, or null if it never does. For tests. */
  ttl(key: string): number | null {
    const entry = this.live(key);
    if (!entry || entry.expiresAt === null) return null;
    return Math.round((entry.expiresAt - this.now()) / 1000);
  }

  set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.data.set(key, { value, expiresAt: ttlSeconds ? this.now() + ttlSeconds * 1000 : null });
    return Promise.resolve();
  }

  incrBy(key: string, by: number, ttlSeconds: number): Promise<number> {
    const next = Number(this.live(key)?.value ?? 0) + by;
    this.data.set(key, { value: String(next), expiresAt: this.now() + ttlSeconds * 1000 });
    return Promise.resolve(next);
  }

  ping(): Promise<boolean> {
    return Promise.resolve(true);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
