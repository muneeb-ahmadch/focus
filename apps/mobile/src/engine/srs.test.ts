import { describe, expect, it } from 'vitest';
import { gradeReview, type SrsState } from './srs';

const state = (intervalDays: number, lapses = 0): SrsState => ({
  intervalDays,
  ease: 2.5,
  lapses,
});

describe('gradeReview', () => {
  const vectors: {
    interval: number;
    lapses?: number;
    grade: 'wrong' | 'unsure' | 'okay' | 'easy';
    expectedInterval: number;
    expectedLapses: number;
    cleared: boolean;
  }[] = [
    { interval: 1, grade: 'easy', expectedInterval: 3, expectedLapses: 0, cleared: false },
    { interval: 3, grade: 'easy', expectedInterval: 7, expectedLapses: 0, cleared: false },
    { interval: 7, grade: 'easy', expectedInterval: 14, expectedLapses: 0, cleared: false },
    { interval: 14, grade: 'easy', expectedInterval: 30, expectedLapses: 0, cleared: false },
    { interval: 30, grade: 'easy', expectedInterval: 30, expectedLapses: 0, cleared: true },
    { interval: 1, grade: 'okay', expectedInterval: 2, expectedLapses: 0, cleared: false },
    { interval: 7, grade: 'okay', expectedInterval: 12, expectedLapses: 0, cleared: false },
    { interval: 20, grade: 'okay', expectedInterval: 30, expectedLapses: 0, cleared: false },
    { interval: 30, grade: 'okay', expectedInterval: 30, expectedLapses: 0, cleared: true },
    { interval: 14, grade: 'unsure', expectedInterval: 14, expectedLapses: 0, cleared: false },
    { interval: 14, grade: 'wrong', expectedInterval: 1, expectedLapses: 1, cleared: false },
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
