import { describe, expect, it } from 'vitest';
import { gradeCheckpoint } from '../src/checkpoint';

const a = (conceptId: string, correct: boolean) => ({ conceptId, correct });

describe('gradeCheckpoint', () => {
  // The vB.4 pass-threshold table (locked decision #4 / CURRICULUM P0-3):
  // 5/5 → mastered, 4/5 → pass (not mastered), ≤3/5 → fail → rehab of the missed concepts.
  it('5/5 → 1.0, passed and mastered', () => {
    const r = gradeCheckpoint([
      a('c.a', true),
      a('c.b', true),
      a('c.c', true),
      a('c.d', true),
      a('c.e', true),
    ]);
    expect(r.score).toBe(1);
    expect(r.passed).toBe(true);
    expect(r.mastered).toBe(true);
    expect(r.missedConceptIds).toEqual([]);
  });

  it('4/5 → 0.8, passes but not mastered (pass line is ≥ 0.8)', () => {
    const r = gradeCheckpoint([
      a('c.a', true),
      a('c.b', true),
      a('c.c', true),
      a('c.d', true),
      a('c.e', false),
    ]);
    expect(r.score).toBe(0.8);
    expect(r.passed).toBe(true);
    expect(r.mastered).toBe(false);
    expect(r.missedConceptIds).toEqual(['c.e']);
  });

  it('3/5 → 0.6, fails (not passed, not mastered), missed concepts drive rehab', () => {
    const r = gradeCheckpoint([
      a('c.a', true),
      a('c.b', true),
      a('c.c', true),
      a('c.d', false),
      a('c.e', false),
    ]);
    expect(r.score).toBe(0.6);
    expect(r.passed).toBe(false);
    expect(r.mastered).toBe(false);
    expect(r.missedConceptIds).toEqual(['c.d', 'c.e']);
  });

  it('two-question 2/2 → 1, no missed concepts, mastered', () => {
    const r = gradeCheckpoint([a('c.a', true), a('c.b', true)]);
    expect(r.score).toBe(1);
    expect(r.passed).toBe(true);
    expect(r.mastered).toBe(true);
    expect(r.missedConceptIds).toEqual([]);
  });

  it('no answers → 0, fails, not mastered', () => {
    const r = gradeCheckpoint([]);
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
    expect(r.mastered).toBe(false);
    expect(r.missedConceptIds).toEqual([]);
  });

  it('deduplicates missed concepts', () => {
    const r = gradeCheckpoint([a('c.a', false), a('c.a', false), a('c.b', true)]);
    expect(r.missedConceptIds).toEqual(['c.a']);
  });

  it('only wrong answers land in missedConceptIds', () => {
    const r = gradeCheckpoint([a('c.a', true), a('c.a', false)]);
    expect(r.missedConceptIds).toEqual(['c.a']);
    expect(r.score).toBe(0.5);
  });
});
