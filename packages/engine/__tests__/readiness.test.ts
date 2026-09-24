import { describe, expect, it } from 'vitest';
import { computeReadiness, routeCoverageFromShares, type ReadinessInputs } from '../src/readiness';
import { lcg } from './helpers';

const inputs = (over: Partial<ReadinessInputs>): ReadinessInputs => ({
  mockScores: [],
  scoredAnswers: 25,
  routeCoverage: 0,
  dueReviews: 0,
  recentAccuracy: 0,
  consistency: 0,
  ...over,
});

const component = (r: ReturnType<typeof computeReadiness>, key: string) =>
  r.components.find((c) => c.key === key);

// MASTER_PLAN §6: with < 2 mocks, mock_trend (0.35) is excluded and the
// remaining weights (.25 + .15 + .15 + .10 = .65) renormalise to 1.
describe('computeReadiness cold start (§6)', () => {
  it('no mocks and < 20 scored answers → no number, no band, no components', () => {
    const r = computeReadiness(inputs({ scoredAnswers: 19, routeCoverage: 1, recentAccuracy: 1 }));
    expect(r.score).toBeNull();
    expect(r.band).toBeNull();
    expect(r.provisional).toBe(true);
    expect(r.components).toEqual([]);
  });

  it('exactly 20 scored answers unlocks a score', () => {
    expect(computeReadiness(inputs({ scoredAnswers: 20 })).score).not.toBeNull();
  });

  it('a finished mock unlocks the estimate even below 20 scored answers (§6: "no mocks AND < 20")', () => {
    const r = computeReadiness(inputs({ scoredAnswers: 0, mockScores: [45] }));
    expect(r.score).not.toBeNull();
    expect(r.provisional).toBe(true);
  });

  it('is provisional while fewer than 2 mocks exist', () => {
    expect(computeReadiness(inputs({ scoredAnswers: 50, routeCoverage: 1 })).provisional).toBe(true);
    expect(computeReadiness(inputs({ mockScores: [40] })).provisional).toBe(true);
    expect(computeReadiness(inputs({ mockScores: [40, 41] })).provisional).toBe(false);
  });

  it('with 1 mock the mock score has NO effect on the number — trend is excluded, not blended', () => {
    const terrible = computeReadiness(inputs({ mockScores: [0], routeCoverage: 0.5 }));
    const perfect = computeReadiness(inputs({ mockScores: [50], routeCoverage: 0.5 }));
    expect(terrible.score).toBe(perfect.score);
    expect(component(terrible, 'mock_trend')).toBeUndefined();
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

describe('full formula at ≥ 2 mocks (§6 weights .35/.25/.15/.15/.10)', () => {
  it('hand-computed vector: mocks [40,45], coverage .6, no debt, acc .9, consistency 1 → 84 high, not provisional', () => {
    // trend = (1/3)·(40/50) + (2/3)·(45/50) = 0.86666…
    // .35·0.86666 + .25·.6 + .15·1 + .15·.9 + .10·1 = .30333 + .15 + .15 + .135 + .10 = .83833 → 84
    const r = computeReadiness(
      inputs({
        mockScores: [40, 45],
        routeCoverage: 0.6,
        dueReviews: 0,
        recentAccuracy: 0.9,
        consistency: 1,
      }),
    );
    expect(r.score).toBe(84);
    expect(r.band).toBe('high');
    expect(r.provisional).toBe(false);
  });

  it('mock trend is recency-weighted: improving beats declining on the same two scores', () => {
    const base = { routeCoverage: 0.5, dueReviews: 5, recentAccuracy: 0.7, consistency: 0.8 };
    const improving = computeReadiness(inputs({ ...base, mockScores: [40, 45] }));
    const declining = computeReadiness(inputs({ ...base, mockScores: [45, 40] }));
    expect(improving.score as number).toBeGreaterThan(declining.score as number);
  });

  it('trend uses only the last 3 mocks', () => {
    const base = { routeCoverage: 0.5, dueReviews: 5, recentAccuracy: 0.7, consistency: 0.8 };
    const withOld = computeReadiness(inputs({ ...base, mockScores: [0, 42, 44, 46] }));
    const without = computeReadiness(inputs({ ...base, mockScores: [50, 42, 44, 46] }));
    expect(withOld.score).toBe(without.score);
  });

  it('trend value: [40,45] → (1·0.8 + 2·0.9)/3; [40,45,20] → (1·0.8 + 2·0.9 + 3·0.4)/6', () => {
    const two = computeReadiness(inputs({ mockScores: [40, 45] }));
    expect(component(two, 'mock_trend')!.value).toBeCloseTo(13 / 15, 10);
    const three = computeReadiness(inputs({ mockScores: [40, 45, 20] }));
    expect(component(three, 'mock_trend')!.value).toBeCloseTo(3.8 / 6, 10);
  });

  it('out-of-range mock scores are clamped per score, never crash', () => {
    const r = computeReadiness(inputs({ mockScores: [-5, 80] }));
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(component(r, 'mock_trend')!.value).toBeLessThanOrEqual(1);
    expect(component(r, 'mock_trend')!.value).toBeGreaterThanOrEqual(0);
  });
});

describe('band boundaries (0–49 low / 50–74 medium / 75–100 high), full-formula mode', () => {
  it('score 49 → low', () => {
    // mocks [0,0] → trend 0; due 20 → debt 0; .25·1 + .15·1 + .10·.9 = .49
    const r = computeReadiness(
      inputs({ mockScores: [0, 0], routeCoverage: 1, dueReviews: 20, recentAccuracy: 1, consistency: 0.9 }),
    );
    expect(r.score).toBe(49);
    expect(r.band).toBe('low');
  });

  it('score 50 → medium', () => {
    // .25·1 + .15·1 + .10·1 = .50
    const r = computeReadiness(
      inputs({ mockScores: [0, 0], routeCoverage: 1, dueReviews: 20, recentAccuracy: 1, consistency: 1 }),
    );
    expect(r.score).toBe(50);
    expect(r.band).toBe('medium');
  });

  it('score 74 → medium', () => {
    // mocks [50,50] → trend 1; .35 + .15(debt) + .15(acc) + .10·.9 = .74
    const r = computeReadiness(
      inputs({ mockScores: [50, 50], routeCoverage: 0, dueReviews: 0, recentAccuracy: 1, consistency: 0.9 }),
    );
    expect(r.score).toBe(74);
    expect(r.band).toBe('medium');
  });

  it('score 75 → high', () => {
    // .35 + .15 + .15 + .10 = .75
    const r = computeReadiness(
      inputs({ mockScores: [50, 50], routeCoverage: 0, dueReviews: 0, recentAccuracy: 1, consistency: 1 }),
    );
    expect(r.score).toBe(75);
    expect(r.band).toBe('high');
  });
});

describe('components (breakdown surface reads these, never recomputes)', () => {
  it('provisional mode: 4 components, no mock_trend, effective weights renormalised', () => {
    const r = computeReadiness(inputs({}));
    expect(r.components.map((c) => c.key)).toEqual([
      'coverage',
      'review_debt',
      'accuracy',
      'consistency',
    ]);
    expect(component(r, 'coverage')!.weight).toBeCloseTo(0.25 / 0.65, 10);
    expect(component(r, 'consistency')!.weight).toBeCloseTo(0.1 / 0.65, 10);
  });

  it('full mode: 5 components led by mock_trend at exactly .35', () => {
    const r = computeReadiness(inputs({ mockScores: [40, 45] }));
    expect(r.components.map((c) => c.key)).toEqual([
      'mock_trend',
      'coverage',
      'review_debt',
      'accuracy',
      'consistency',
    ]);
    expect(component(r, 'mock_trend')!.weight).toBe(0.35);
    expect(component(r, 'coverage')!.weight).toBe(0.25);
  });

  it('review_debt component value is the penalty signal: 0 due → 1, 20+ due → 0', () => {
    expect(component(computeReadiness(inputs({ dueReviews: 0 })), 'review_debt')!.value).toBe(1);
    expect(component(computeReadiness(inputs({ dueReviews: 20 })), 'review_debt')!.value).toBe(0);
    expect(component(computeReadiness(inputs({ dueReviews: 10 })), 'review_debt')!.value).toBe(0.5);
  });
});

// CURRICULUM §4 P1-4: route_coverage is yield-weighted by each route's share of
// the bank, so completing a large-share route (R7, ~24%) counts for more than a
// small one (R1, ~8%). This is a formula-INTERNAL change producing the 0..1
// routeCoverage input; the top-level 0.25 weight and the band cuts are untouched.
// The bank shares are computed at the app layer (from bank.json) and passed in —
// this pure function only combines them, mirroring routeQuotaFromShares.
describe('routeCoverageFromShares — yield-weighted coverage (§4 P1-4)', () => {
  it('empty list → 0', () => {
    expect(routeCoverageFromShares([])).toBe(0);
  });

  it('one fully-completed route contributes exactly its bank share', () => {
    expect(routeCoverageFromShares([{ bankShare: 0.084, completion: 1 }])).toBeCloseTo(0.084, 10);
  });

  it('completing a bigger-share route yields more coverage than a smaller one', () => {
    const small = routeCoverageFromShares([{ bankShare: 0.084, completion: 1 }]);
    const big = routeCoverageFromShares([{ bankShare: 0.245, completion: 1 }]);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeCloseTo(0.245, 10);
  });

  it('coverage sums each route bankShare × completion', () => {
    // R1 fully done (share .084) + R2 half done (share .18) → .084 + .09
    const c = routeCoverageFromShares([
      { bankShare: 0.084, completion: 1 },
      { bankShare: 0.18, completion: 0.5 },
    ]);
    expect(c).toBeCloseTo(0.084 + 0.09, 10);
  });

  it('a route with completion 0 (unauthored or untouched) contributes nothing', () => {
    const c = routeCoverageFromShares([
      { bankShare: 0.084, completion: 1 },
      { bankShare: 0.5, completion: 0 },
    ]);
    expect(c).toBeCloseTo(0.084, 10);
  });

  it('all seven routes fully done (shares sum to 1) → coverage 1', () => {
    const shares = [0.084, 0.18, 0.207, 0.088, 0.075, 0.123, 0.243]; // sums to 1
    const c = routeCoverageFromShares(shares.map((s) => ({ bankShare: s, completion: 1 })));
    expect(c).toBeCloseTo(1, 10);
  });

  it('out-of-range shares/completion are clamped; result never leaves 0..1', () => {
    expect(routeCoverageFromShares([{ bankShare: 2, completion: 2 }])).toBe(1);
    expect(routeCoverageFromShares([{ bankShare: -1, completion: 1 }])).toBe(0);
    expect(routeCoverageFromShares([{ bankShare: 0.5, completion: -1 }])).toBe(0);
  });

  it('more completion never lowers coverage (monotonic), all else equal', () => {
    const lo = routeCoverageFromShares([{ bankShare: 0.3, completion: 0.4 }]);
    const hi = routeCoverageFromShares([{ bankShare: 0.3, completion: 0.7 }]);
    expect(hi).toBeGreaterThanOrEqual(lo);
  });

  it('plugs into computeReadiness as routeCoverage — same 65/medium vector, 0.25 weight intact', () => {
    // coverage .2 mirrors the existing hand-computed vector: acc .8, consistency 1, no debt → 65
    const coverage = routeCoverageFromShares([{ bankShare: 0.2, completion: 1 }]);
    const r = computeReadiness(
      inputs({ routeCoverage: coverage, dueReviews: 0, recentAccuracy: 0.8, consistency: 1 }),
    );
    expect(r.score).toBe(65);
    expect(r.band).toBe('medium');
    expect(component(r, 'coverage')!.weight).toBeCloseTo(0.25 / 0.65, 10);
  });
});

describe('computeReadiness properties', () => {
  it('1000 random inputs: score null iff (no mocks and <20 answers); else integer 0–100, consistent band, weights sum to 1±1e-9, values 0–1', () => {
    const rng = lcg(11);
    for (let i = 0; i < 1000; i++) {
      const mockCount = Math.floor(rng() * 5);
      const scoredAnswers = Math.floor(rng() * 60);
      const r = computeReadiness({
        mockScores: Array.from({ length: mockCount }, () => Math.floor(rng() * 71) - 10),
        scoredAnswers,
        routeCoverage: rng() * 1.5 - 0.2,
        dueReviews: Math.floor(rng() * 60),
        recentAccuracy: rng() * 1.5 - 0.2,
        consistency: rng() * 1.5 - 0.2,
      });
      if (mockCount === 0 && scoredAnswers < 20) {
        expect(r.score).toBeNull();
        expect(r.band).toBeNull();
        expect(r.components).toEqual([]);
      } else {
        const s = r.score as number;
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
        expect(r.band).toBe(s <= 49 ? 'low' : s <= 74 ? 'medium' : 'high');
        const weightSum = r.components.reduce((a, c) => a + c.weight, 0);
        expect(Math.abs(weightSum - 1)).toBeLessThan(1e-9);
        for (const c of r.components) {
          expect(c.value).toBeGreaterThanOrEqual(0);
          expect(c.value).toBeLessThanOrEqual(1);
        }
      }
      expect(r.provisional).toBe(mockCount < 2);
    }
  });

  it('more coverage never lowers the score, all else equal (both modes)', () => {
    const rng = lcg(13);
    for (let i = 0; i < 200; i++) {
      const base = inputs({
        mockScores: i % 2 === 0 ? [] : [Math.floor(rng() * 51), Math.floor(rng() * 51)],
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

  it('a higher latest mock score never lowers the score, all else equal', () => {
    const rng = lcg(17);
    for (let i = 0; i < 200; i++) {
      const earlier = [Math.floor(rng() * 51), Math.floor(rng() * 51)];
      const rest = inputs({
        routeCoverage: rng(),
        dueReviews: Math.floor(rng() * 30),
        recentAccuracy: rng(),
        consistency: rng(),
      });
      const latest = Math.floor(rng() * 40);
      const lo = computeReadiness({ ...rest, mockScores: [...earlier, latest] }).score as number;
      const hi = computeReadiness({ ...rest, mockScores: [...earlier, latest + 10] }).score as number;
      expect(hi).toBeGreaterThanOrEqual(lo);
    }
  });
});
