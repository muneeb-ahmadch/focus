import { describe, expect, it } from 'vitest';
import { computeReadiness } from './readiness';

describe('computeReadiness', () => {
  it('under 20 scored answers → no score, no band', () => {
    const r = computeReadiness({
      scoredAnswers: 10,
      routeCoverage: 1.0,
      dueReviews: 0,
      recentAccuracy: 1.0,
      consistency: 1.0,
    });
    expect(r.score).toBeNull();
    expect(r.band).toBeNull();
    expect(r.provisional).toBe(true);
  });

  it('60 answers, coverage 0.4, 5 due, accuracy 0.8, consistency 0.5 → 59 medium', () => {
    const r = computeReadiness({
      scoredAnswers: 60,
      routeCoverage: 0.4,
      dueReviews: 5,
      recentAccuracy: 0.8,
      consistency: 0.5,
    });
    expect(r.score).toBe(59);
    expect(r.band).toBe('medium');
  });

  it('25 answers, coverage 0, 25 due, accuracy 0.45, consistency 0.2 → 13 low', () => {
    const r = computeReadiness({
      scoredAnswers: 25,
      routeCoverage: 0,
      dueReviews: 25,
      recentAccuracy: 0.45,
      consistency: 0.2,
    });
    expect(r.score).toBe(13);
    expect(r.band).toBe('low');
  });

  it('100 answers, coverage 1.0, 0 due, accuracy 0.95, consistency 0.9 → 97 high', () => {
    const r = computeReadiness({
      scoredAnswers: 100,
      routeCoverage: 1.0,
      dueReviews: 0,
      recentAccuracy: 0.95,
      consistency: 0.9,
    });
    expect(r.score).toBe(97);
    expect(r.band).toBe('high');
  });

  it('20 answers, everything at zero, 40 due → 0 low', () => {
    const r = computeReadiness({
      scoredAnswers: 20,
      routeCoverage: 0,
      dueReviews: 40,
      recentAccuracy: 0,
      consistency: 0,
    });
    expect(r.score).toBe(0);
    expect(r.band).toBe('low');
  });
});
