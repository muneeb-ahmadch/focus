import { describe, expect, it } from 'vitest';
import { gradeReview, newReviewState, type SrsGrade, type SrsState } from '../src/srs';
import { lcg, pick } from './helpers';

const state = (intervalDays: number, lapses = 0): SrsState => ({
  intervalDays,
  ease: 2.5,
  lapses,
});

describe('gradeReview spec vectors (MASTER_PLAN Appendix C)', () => {
  const vectors: {
    interval: number;
    lapses?: number;
    grade: SrsGrade;
    expectedInterval: number;
    expectedLapses: number;
    cleared: boolean;
  }[] = [
    { interval: 1, grade: 'easy', expectedInterval: 3, expectedLapses: 0, cleared: false },
    { interval: 3, grade: 'easy', expectedInterval: 7, expectedLapses: 0, cleared: false },
    { interval: 7, grade: 'easy', expectedInterval: 14, expectedLapses: 0, cleared: false },
    { interval: 14, grade: 'easy', expectedInterval: 30, expectedLapses: 0, cleared: false },
    { interval: 30, grade: 'easy', expectedInterval: 30, expectedLapses: 0, cleared: true },
    { interval: 2, grade: 'easy', expectedInterval: 3, expectedLapses: 0, cleared: false },
    { interval: 1, grade: 'okay', expectedInterval: 2, expectedLapses: 0, cleared: false },
    { interval: 7, grade: 'okay', expectedInterval: 12, expectedLapses: 0, cleared: false },
    { interval: 18, grade: 'okay', expectedInterval: 30, expectedLapses: 0, cleared: false },
    { interval: 20, grade: 'okay', expectedInterval: 30, expectedLapses: 0, cleared: false },
    { interval: 30, grade: 'okay', expectedInterval: 30, expectedLapses: 0, cleared: true },
    { interval: 14, grade: 'unsure', expectedInterval: 14, expectedLapses: 0, cleared: false },
    { interval: 30, grade: 'unsure', expectedInterval: 30, expectedLapses: 0, cleared: false },
    { interval: 14, grade: 'wrong', expectedInterval: 1, expectedLapses: 1, cleared: false },
    { interval: 30, grade: 'wrong', expectedInterval: 1, expectedLapses: 1, cleared: false },
    { interval: 1, lapses: 2, grade: 'wrong', expectedInterval: 1, expectedLapses: 3, cleared: false },
  ];

  for (const v of vectors) {
    it(`interval ${v.interval}${v.lapses ? ` (lapses ${v.lapses})` : ''} + ${v.grade} → interval ${v.expectedInterval}, lapses ${v.expectedLapses}, cleared ${v.cleared}`, () => {
      const result = gradeReview(state(v.interval, v.lapses ?? 0), v.grade);
      expect(result.intervalDays).toBe(v.expectedInterval);
      expect(result.lapses).toBe(v.expectedLapses);
      expect(result.cleared).toBe(v.cleared);
    });
  }
});

describe('newReviewState', () => {
  it('starts at interval 1, no lapses', () => {
    expect(newReviewState()).toEqual({ intervalDays: 1, ease: 2.5, lapses: 0 });
  });
});

describe('gradeReview properties', () => {
  const GRADES: SrsGrade[] = ['wrong', 'unsure', 'okay', 'easy'];

  it('500 random walks: interval ∈ [1,30] integer, lapses count wrongs, cleared only on correct at 30', () => {
    for (let run = 0; run < 500; run++) {
      const rng = lcg(run + 1);
      let s: SrsState = newReviewState();
      let wrongs = 0;
      for (let step = 0; step < 40; step++) {
        const grade = pick(rng, GRADES);
        const before = s.intervalDays;
        const r = gradeReview(s, grade);

        expect(Number.isInteger(r.intervalDays)).toBe(true);
        expect(r.intervalDays).toBeGreaterThanOrEqual(1);
        expect(r.intervalDays).toBeLessThanOrEqual(30);

        if (grade === 'wrong') {
          wrongs += 1;
          expect(r.intervalDays).toBe(1);
        }
        if (grade === 'unsure') expect(r.intervalDays).toBe(before);
        if (grade === 'okay' || grade === 'easy') {
          expect(r.intervalDays).toBeGreaterThanOrEqual(before);
        }
        expect(r.lapses).toBe(wrongs);
        expect(r.cleared).toBe(before >= 30 && (grade === 'okay' || grade === 'easy'));

        s = { intervalDays: r.intervalDays, ease: r.ease, lapses: r.lapses };
      }
    }
  });

  it('easy-only path walks the exact ladder 1→3→7→14→30 then clears', () => {
    let s: SrsState = newReviewState();
    const seen: number[] = [s.intervalDays];
    for (let i = 0; i < 4; i++) {
      const r = gradeReview(s, 'easy');
      expect(r.cleared).toBe(false);
      s = r;
      seen.push(s.intervalDays);
    }
    expect(seen).toEqual([1, 3, 7, 14, 30]);
    expect(gradeReview(s, 'easy').cleared).toBe(true);
  });
});
