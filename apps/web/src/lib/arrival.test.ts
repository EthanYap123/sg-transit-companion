import { describe, expect, it } from 'vitest';
import { formatAgo, formatClock, formatMinutesAway, minutesUntil } from './arrival';

describe('formatMinutesAway', () => {
  it.each([
    [0, 'Arr'],
    [1, 'Arr'],
    [2, '2 min'],
    [12.9, '12 min'],
    [Number.NaN, 'Arr'],
  ])('%s minutes -> %s', (minutes, label) => {
    expect(formatMinutesAway(minutes)).toBe(label);
  });
});

describe('minutesUntil', () => {
  const now = Date.parse('2026-11-04T08:00:00+08:00');

  it.each([
    ['2026-11-04T08:05:30+08:00', 5],
    ['2026-11-04T08:00:59+08:00', 0],
    ['2026-11-04T07:58:00+08:00', 0],
  ])('%s -> %s', (iso, minutes) => {
    expect(minutesUntil(iso, now)).toBe(minutes);
  });
});

describe('formatClock', () => {
  it('shows Singapore time on a 24 hour clock', () => {
    expect(formatClock('2026-11-04T17:03:10+08:00')).toBe('17:03');
    expect(formatClock('2026-11-04T16:30:00Z')).toBe('00:30');
  });
});

describe('formatAgo', () => {
  const at = '2026-11-04T08:00:00+08:00';
  const start = Date.parse(at);

  it.each([
    [2_000, 'just now'],
    [12_000, '12 s ago'],
    [59_000, '59 s ago'],
    [180_000, '3 min ago'],
    [-5_000, 'just now'],
  ])('%s ms later -> %s', (ms, label) => {
    expect(formatAgo(at, start + ms)).toBe(label);
  });
});
