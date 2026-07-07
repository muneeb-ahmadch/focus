import { describe, expect, it } from 'vitest';
import { computeReadiness, type ReadinessInputs } from '../src/readiness';
import { lcg } from './helpers';

const inputs = (over: Partial<ReadinessInputs>): ReadinessInputs => ({
  scoredAnswers: 25,
  routeCoverage: 0,
  dueReviews: 0,
  recentAccuracy: 0,
  consistency: 0,
  ...over,
});

// v1 has no mocks, so mock_trend (0.35) is always excluded and the remaining
// weights (.25 + .15 + .15 + .10 = .65) renormalise to 1 — MASTER_PLAN §6.
describe('computeReadiness cold start (§6)', () => {
  it('< 20 scored answers → no number, no band', () => {
    const r = computeReadiness(inputs({ scoredAnswers: 19, routeCoverage: 1, recentAccuracy: 1 }));
    expect(r.score).toBeNull();
    expect(r.band).toBeNull();
  });

  it('exactly 20 scored answers unlocks a score', () => {
    expect(computeReadiness(inputs({ scoredAnswers: 20 })).score).not.toBeNull();
  });

  it('is always provisional while mocks do not exist', () => {
    expect(computeReadiness(inputs({ scoredAnswers: 10 })).provisional).toBe(true);
    expect(computeReadiness(inputs({ scoredAnswers: 50, routeCoverage: 1 })).provisional).toBe(true);
  });

  it('perfect inputs → exactly 100 (renormalised weights sum to 1)', () => {
    const r = computeReadiness(
      inputs({ routeCoverage: 1, dueReviews: 0, recentAccuracy: 1, consistency: 1 }),
    );
    expect(r.score).toBe(100);
    expect(r.band).toBe('high');
  });

  it('worst inputs → exactly 0', () => {
    const r = computeReadiness(inputs({ dueReviews: 40 }));
    expect(r.score).toBe(0);
    expect(r.band).toBe('low');
  });

  it('hand-computed vector: coverage .2, acc .8, consistency 1, no debt → 65 medium', () => {
    // (.25·.2 + .15·1 + .15·.8 + .10·1) / .65 = .42/.65 = 0.64615… → 65
    const r = computeReadiness(
      inputs({ routeCoverage: 0.2, dueReviews: 0, recentAccuracy: 0.8, consistency: 1 }),
    );
    expect(r.score).toBe(65);
    expect(r.band).toBe('medium');
  });

  it('review debt saturates at 20 due items', () => {
    const at20 = computeReadiness(inputs({ routeCoverage: 1, dueReviews: 20 }));
    const at40 = computeReadiness(inputs({ routeCoverage: 1, dueReviews: 40 }));
    expect(at20.score).toBe(at40.score);
  });
});

describe('band boundaries (0–49 low / 50–74 medium / 75–100 high)', () => {
  const debtZero = { dueReviews: 20 };

  it('score 49 → low', () => {
    // (.25 + .15·.46) / .65 = .319/.65 = 0.4907… → 49
    const r = computeReadiness(inputs({ routeCoverage: 1, recentAccuracy: 0.46, ...debtZero }));
    expect(r.score).toBe(49);
    expect(r.band).toBe('low');
  });

  it('score 50 → medium', () => {
    // (.25 + .15·.5) / .65 = .325/.65 = 0.5 → 50
    const r = computeReadiness(inputs({ routeCoverage: 1, recentAccuracy: 0.5, ...debtZero }));
    expect(r.score).toBe(50);
    expect(r.band).toBe('medium');
  });

  it('score 74 → medium', () => {
    // (.25 + .15 + .10·.81) / .65 = .481/.65 = 0.74 → 74
    const r = computeReadiness(
      inputs({ routeCoverage: 1, recentAccuracy: 1, consistency: 0.81, ...debtZero }),
    );
    expect(r.score).toBe(74);
    expect(r.band).toBe('medium');
  });

  it('score 75 → high', () => {
    // (.25 + .15 + .10·.875) / .65 = .4875/.65 = 0.75 → 75
    const r = computeReadiness(
      inputs({ routeCoverage: 1, recentAccuracy: 1, consistency: 0.875, ...debtZero }),
    );
    expect(r.score).toBe(75);
    expect(r.band).toBe('high');
  });
});

describe('computeReadiness properties', () => {
  it('500 random inputs (incl. out-of-range): score null iff <20 answers, else integer 0–100 with consistent band', () => {
    const rng = lcg(11);
    for (let i = 0; i < 500; i++) {
      const scoredAnswers = Math.floor(rng() * 60);
      const r = computeReadiness({
        scoredAnswers,
        routeCoverage: rng() * 1.5 - 0.2,
        dueReviews: Math.floor(rng() * 60),
        recentAccuracy: rng() * 1.5 - 0.2,
        consistency: rng() * 1.5 - 0.2,
      });
      if (scoredAnswers < 20) {
        expect(r.score).toBeNull();
        expect(r.band).toBeNull();
      } else {
        expect(r.score).not.toBeNull();
        const s = r.score as number;
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
        expect(r.band).toBe(s <= 49 ? 'low' : s <= 74 ? 'medium' : 'high');
      }
      expect(r.provisional).toBe(true);
    }
  });

  it('more coverage never lowers the score, all else equal', () => {
    const rng = lcg(13);
    for (let i = 0; i < 200; i++) {
      const base = inputs({
        routeCoverage: rng() * 0.8,
        dueReviews: Math.floor(rng() * 30),
        recentAccuracy: rng(),
        consistency: rng(),
      });
      const lo = computeReadiness(base).score as number;
      const hi = computeReadiness({ ...base, routeCoverage: base.routeCoverage + 0.2 })
        .score as number;
      expect(hi).toBeGreaterThanOrEqual(lo);
    }
  });
});
