import { describe, expect, it } from 'vitest';
import { computeRouteMastery } from '../src/mastery';
import { lcg } from './helpers';

describe('computeRouteMastery', () => {
  it('nothing done → 0', () => {
    expect(
      computeRouteMastery({ completed: 0, total: 5, checkpointScores: [], weakConcepts: 0 }),
    ).toBe(0);
  });

  it('route with no missions → 0, no divide-by-zero', () => {
    expect(
      computeRouteMastery({ completed: 0, total: 0, checkpointScores: [], weakConcepts: 0 }),
    ).toBe(0);
  });

  it('one mission at 0.8 out of five → 0.44 (0.6·0.2 + 0.4·0.8)', () => {
    expect(
      computeRouteMastery({ completed: 1, total: 5, checkpointScores: [0.8], weakConcepts: 0 }),
    ).toBeCloseTo(0.44, 10);
  });

  it('each weak concept subtracts 0.03', () => {
    expect(
      computeRouteMastery({ completed: 1, total: 5, checkpointScores: [0.8], weakConcepts: 2 }),
    ).toBeCloseTo(0.38, 10);
  });

  it('perfect route → exactly 1', () => {
    expect(
      computeRouteMastery({
        completed: 5,
        total: 5,
        checkpointScores: [1, 1, 1, 1, 1],
        weakConcepts: 0,
      }),
    ).toBe(1);
  });

  it('clamps at 0 under heavy weak-concept debt', () => {
    expect(
      computeRouteMastery({ completed: 0, total: 5, checkpointScores: [0.2], weakConcepts: 10 }),
    ).toBe(0);
  });

  it('property: always within [0,1]', () => {
    const rng = lcg(7);
    for (let i = 0; i < 300; i++) {
      const total = Math.floor(rng() * 8);
      const completed = Math.floor(rng() * (total + 1));
      const scores = Array.from({ length: completed }, () => rng());
      const m = computeRouteMastery({
        completed,
        total,
        checkpointScores: scores,
        weakConcepts: Math.floor(rng() * 12),
      });
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
    }
  });
});
