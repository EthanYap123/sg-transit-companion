import type { CacheStore } from './store.js';

export interface CommandBudgetOptions {
  /** Redis commands allowed per UTC day for optional work (arrival snapshots). */
  dailyLimit: number;
  /** Where to persist the running count so an API restart does not reset it. */
  store?: CacheStore | null;
  /** Persist after this many commands, to keep the bookkeeping itself cheap. */
  flushEvery?: number;
  now?: () => number;
}

const TWO_DAYS_SECONDS = 2 * 24 * 60 * 60;

/**
 * Keeps optional Redis use under a daily ceiling so the Upstash free tier (500K commands/month,
 * shared by staging and production) is never used up. See docs/ARCHITECTURE.md, "Redis command budget".
 */
export class CommandBudget {
  private readonly dailyLimit: number;
  private readonly store: CacheStore | null;
  private readonly flushEvery: number;
  private readonly now: () => number;
  private day: string;
  private usedToday = 0;
  private unflushed = 0;

  constructor(options: CommandBudgetOptions) {
    this.dailyLimit = options.dailyLimit;
    this.store = options.store ?? null;
    this.flushEvery = options.flushEvery ?? 100;
    this.now = options.now ?? Date.now;
    this.day = this.today();
  }

  get used(): number {
    this.rollDay();
    return this.usedToday;
  }

  get remaining(): number {
    return Math.max(0, this.dailyLimit - this.used);
  }

  /** Reserves `count` commands. Returns false, reserving nothing, when that would pass the limit. */
  allow(count = 1): boolean {
    this.rollDay();
    if (this.usedToday + count > this.dailyLimit) return false;
    this.usedToday += count;
    this.unflushed += count;
    if (this.store && this.unflushed >= this.flushEvery) this.flush(this.store);
    return true;
  }

  /** Picks up today's count saved by a previous run of the API. */
  async load(): Promise<void> {
    if (!this.store) return;
    try {
      const saved = Number(await this.store.get(this.key()));
      if (Number.isFinite(saved) && saved > this.usedToday) this.usedToday = saved;
    } catch {
      // Redis unavailable: start from the in-memory count.
    }
  }

  private flush(store: CacheStore): void {
    const count = this.unflushed;
    const key = this.key();
    this.unflushed = 0;
    // The flush is one MULTI with INCRBY + EXPIRE.
    this.usedToday += 2;
    store.incrBy(key, count + 2, TWO_DAYS_SECONDS).catch(() => {
      this.unflushed += count;
    });
  }

  private today(): string {
    return new Date(this.now()).toISOString().slice(0, 10);
  }

  private key(): string {
    return `budget:${this.day}`;
  }

  private rollDay(): void {
    const today = this.today();
    if (today === this.day) return;
    this.day = today;
    this.usedToday = 0;
    this.unflushed = 0;
  }
}
