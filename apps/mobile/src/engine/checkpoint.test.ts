import { describe, expect, it } from 'vitest';
import { gradeCheckpoint } from './checkpoint';

describe('gradeCheckpoint', () => {
  it('5/5 → score 1.0, pass, no missed concepts', () => {
    const r = gradeCheckpoint([
      { conceptId: 'c.a', correct: true },
      { conceptId: 'c.b', correct: true },
      { conceptId: 'c.c', correct: true },
      { conceptId: 'c.d', correct: true },
      { conceptId: 'c.e', correct: true },
    ]);
    expect(r.score).toBe(1.0);
    expect(r.passed).toBe(true);
    expect(r.missedConceptIds).toEqual([]);
  });

  it('4/5 → score 0.8, pass, missed concept listed', () => {
    const r = gradeCheckpoint([
      { conceptId: 'c.a', correct: true },
      { conceptId: 'c.b', correct: true },
      { conceptId: 'c.c', correct: true },
      { conceptId: 'c.d', correct: true },
      { conceptId: 'c.x', correct: false },
    ]);
    expect(r.score).toBe(0.8);
    expect(r.passed).toBe(true);
    expect(r.missedConceptIds).toEqual(['c.x']);
  });

  it('3/5 → score 0.6, fail, both missed concepts listed', () => {
    const r = gradeCheckpoint([
      { conceptId: 'c.a', correct: true },
      { conceptId: 'c.b', correct: true },
      { conceptId: 'c.c', correct: true },
      { conceptId: 'c.x', correct: false },
      { conceptId: 'c.y', correct: false },
    ]);
    expect(r.score).toBe(0.6);
    expect(r.passed).toBe(false);
    expect(r.missedConceptIds).toEqual(['c.x', 'c.y']);
  });
});
