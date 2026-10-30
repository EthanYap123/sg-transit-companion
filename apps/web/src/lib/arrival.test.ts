import { describe, expect, it } from 'vitest';
import { formatMinutesAway } from './arrival';

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
