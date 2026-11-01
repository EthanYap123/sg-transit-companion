import { describe, expect, it, vi } from 'vitest';
import { CommandBudget } from '../../src/cache/command-budget.js';
import { MemoryStore } from '../../src/cache/store.js';

function setup(dailyLimit: number, flushEvery = 100) {
  let time = Date.parse('2026-11-01T10:00:00Z');
  const now = () => time;
  const store = new MemoryStore(now);
  const budget = new CommandBudget({ dailyLimit, store, flushEvery, now });
  return { budget, store, now, advance: (ms: number) => (time += ms) };
}

describe('CommandBudget', () => {
  it('allows commands up to the daily limit, then refuses', () => {
    const budget = new CommandBudget({ dailyLimit: 3 });

    expect([budget.allow(), budget.allow(), budget.allow(), budget.allow()]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(budget.remaining).toBe(0);
  });

  it('refuses a batch that would pass the limit without using any of it', () => {
    const budget = new CommandBudget({ dailyLimit: 5 });
    budget.allow(4);

    expect(budget.allow(2)).toBe(false);
    expect(budget.used).toBe(4);
  });

  it('starts again at midnight UTC', () => {
    const { budget, advance } = setup(2, 1_000);
    budget.allow(2);
    expect(budget.allow()).toBe(false);

    advance(14 * 60 * 60 * 1000);

    expect(budget.allow()).toBe(true);
    expect(budget.used).toBe(1);
  });

  it('saves the count to Redis every 100 commands, with a two day expiry', async () => {
    const { budget, store } = setup(1_000);

    for (let i = 0; i < 100; i += 1) budget.allow();

    await vi.waitFor(async () => expect(await store.get('budget:2026-11-01')).toBe('102'));
    expect(store.ttl('budget:2026-11-01')).toBe(2 * 24 * 60 * 60);
    expect(budget.used).toBe(102);
  });

  it('carries on from the saved count after a restart', async () => {
    const { store, now } = setup(1_000);
    await store.set('budget:2026-11-01', '950');
    const budget = new CommandBudget({ dailyLimit: 1_000, store, now });

    await budget.load();

    expect(budget.used).toBe(950);
    expect(budget.remaining).toBe(50);
  });

  it('keeps counting in memory when saving fails', async () => {
    const store = new MemoryStore();
    vi.spyOn(store, 'incrBy').mockRejectedValue(new Error('down'));
    const budget = new CommandBudget({ dailyLimit: 1_000, store, flushEvery: 2 });

    budget.allow(2);
    await Promise.resolve();

    expect(budget.used).toBe(4);
    expect(budget.allow()).toBe(true);
  });

  it('starts from zero when the saved count cannot be read', async () => {
    const store = new MemoryStore();
    vi.spyOn(store, 'get').mockRejectedValue(new Error('down'));
    const budget = new CommandBudget({ dailyLimit: 10, store });

    await budget.load();

    expect(budget.used).toBe(0);
  });
});
