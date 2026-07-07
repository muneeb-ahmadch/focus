import { describe, expect, it } from 'vitest';
import { computeRouteMastery } from './mastery';

describe('computeRouteMastery', () => {
  it('(2,5,[0.8,0.8],0) → 0.56', () => {
    expect(
      computeRouteMastery({ completed: 2, total: 5, checkpointScores: [0.8, 0.8], weakConcepts: 0 }),
    ).toBeCloseTo(0.56, 5);
  });

  it('(2,5,[0.8,0.8],2) → 0.50', () => {
    expect(
      computeRouteMastery({ completed: 2, total: 5, checkpointScores: [0.8, 0.8], weakConcepts: 2 }),
    ).toBeCloseTo(0.5, 5);
  });

  it('(0,5,[],0) → 0', () => {
    expect(
      computeRouteMastery({ completed: 0, total: 5, checkpointScores: [], weakConcepts: 0 }),
    ).toBe(0);
  });

  it('(5,5,[1,0.8,1,0.8,1],1) → 0.938', () => {
    expect(
      computeRouteMastery({
        completed: 5,
        total: 5,
        checkpointScores: [1, 0.8, 1, 0.8, 1],
        weakConcepts: 1,
      }),
    ).toBeCloseTo(0.938, 5);
  });
});
