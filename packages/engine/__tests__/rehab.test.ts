// Slice v5 gate: the Mistake Rehab ladder outcome is pure and total.
// Spec anchor (SLICES v5): rehab clears an item ONLY after
// correct-with-confidence — every answer correct AND the final answer
// confirmed 'sure'. Anything less leaves the item active.
import { describe, expect, it } from 'vitest';
import { rehabOutcome, type RehabAnswer } from '../src';

const sure = (correct = true): RehabAnswer => ({ correct, confidence: 'sure' });
const unsure = (correct = true): RehabAnswer => ({ correct, confidence: 'unsure' });

describe('rehabOutcome', () => {
  it('clears only when every answer is correct and the final answer is sure', () => {
    expect(rehabOutcome([sure(), sure()])).toEqual({ cleared: true, grade: 'easy' });
    expect(rehabOutcome([unsure(), sure()])).toEqual({ cleared: true, grade: 'easy' });
    expect(rehabOutcome([sure()])).toEqual({ cleared: true, grade: 'easy' });
  });

  it('all correct but final answer unsure → not cleared, SRS holds', () => {
    expect(rehabOutcome([sure(), unsure()])).toEqual({ cleared: false, grade: 'unsure' });
    expect(rehabOutcome([unsure()])).toEqual({ cleared: false, grade: 'unsure' });
  });

  it('any wrong answer → not cleared, SRS wrong (reset + lapse)', () => {
    expect(rehabOutcome([sure(false)])).toEqual({ cleared: false, grade: 'wrong' });
    expect(rehabOutcome([sure(false), sure()])).toEqual({ cleared: false, grade: 'wrong' });
    expect(rehabOutcome([sure(), unsure(false)])).toEqual({ cleared: false, grade: 'wrong' });
  });

  it('wrong dominates even when the final answer is confident and correct', () => {
    expect(rehabOutcome([unsure(false), sure(true)])).toEqual({
      cleared: false,
      grade: 'wrong',
    });
  });

  it('empty ladder never clears', () => {
    expect(rehabOutcome([])).toEqual({ cleared: false, grade: 'unsure' });
  });
});
