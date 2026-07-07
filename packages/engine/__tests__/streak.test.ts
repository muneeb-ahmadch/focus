import { describe, expect, it } from 'vitest';
import { computeStreak, hitMilestone } from '../src/streak';

// Day numbers are local-calendar epoch days (conversion lives in the app's clock.ts),
// so DST/timezone cannot exist at this layer by construction.
const D = 20_640;

describe('computeStreak', () => {
  it('three consecutive days ending today → 3', () => {
    expect(computeStreak([D - 2, D - 1, D], D)).toBe(3);
  });

  it('streak ending yesterday is still alive → 2', () => {
    expect(computeStreak([D - 2, D - 1], D)).toBe(2);
  });

  it('streak ending two days ago is dead → 0', () => {
    expect(computeStreak([D - 3, D - 2], D)).toBe(0);
  });

  it('only today → 1', () => {
    expect(computeStreak([D], D)).toBe(1);
  });

  it('no active days → 0', () => {
    expect(computeStreak([], D)).toBe(0);
  });

  it('duplicates and unsorted input → 3', () => {
    expect(computeStreak([D - 1, D - 1, D, D - 2], D)).toBe(3);
  });

  it('gap in the middle counts only the tail run → 2', () => {
    expect(computeStreak([D - 4, D - 3, D - 1, D], D)).toBe(2);
  });

  it('future days are not part of the streak ending today', () => {
    expect(computeStreak([D - 1, D, D + 3], D)).toBe(2);
  });

  it('30 consecutive days → 30', () => {
    const days = Array.from({ length: 30 }, (_, i) => D - i);
    expect(computeStreak(days, D)).toBe(30);
  });
});

describe('hitMilestone', () => {
  const vectors: [number, number, number | null][] = [
    [2, 3, 3],
    [3, 3, null],
    [6, 7, 7],
    [7, 8, null],
    [13, 14, 14],
    [29, 30, 30],
    [30, 31, null],
    [0, 1, null],
    [0, 0, null],
  ];
  for (const [prev, next, want] of vectors) {
    it(`(${prev}, ${next}) → ${want}`, () => {
      expect(hitMilestone(prev, next)).toBe(want);
    });
  }
});
