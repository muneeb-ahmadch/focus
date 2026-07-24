// Slice v7 gate: mock generation engine. Spec anchors from SLICES.md v7 card:
//   generateMock(pool, history, bp, rng): MockPaper
//   exclusion window: min(3, floor((eligiblePool - 50) / 50)), never negative
//   pool 120→1, 150→2, 200→3(capped), 300→3; short pool relaxes window before failing
//   invariants: exactly 50 questions, exactly 3 video MCQs, signs minimum coverage per bp
//   timer from wall-clock timestamps (endsAt = startedAt + 3_420_000), pass mark 43.
// History is ordered oldest → newest; the window excludes questions asked in the
// last `window` attempts. Relaxation shrinks the window toward 0 only as far as
// needed to fill the blueprint; an unfillable blueprint at window 0 throws.
import { describe, expect, it } from 'vitest';
import {
  exclusionWindow,
  generateMock,
  mockRemainingMs,
  routeQuotaFromShares,
  scoreMock,
  MOCK_DURATION_MS,
  MOCK_PASS_MARK,
  MOCK_TOTAL,
  MOCK_VIDEO_COUNT,
  type Blueprint,
  type MockHistoryAttempt,
  type MockPoolQuestion,
} from '../src';
import { lcg } from './helpers';

const BP: Blueprint = { total: 50, videoCount: 3, minSigns: 5 };

function makePool(opts: { size: number; videos: number; signs: number }): MockPoolQuestion[] {
  const pool: MockPoolQuestion[] = [];
  for (let i = 0; i < opts.size; i++) {
    pool.push({
      id: `q${i}`,
      routeId: `route-${(i % 7) + 1}`,
      video: i < opts.videos,
      sign: i >= opts.videos && i < opts.videos + opts.signs,
    });
  }
  return pool;
}

function attempt(ids: string[], startedAt: number): MockHistoryAttempt {
  return { questionIds: ids, startedAt };
}

describe('locked constants (product rule 5)', () => {
  it('50 questions / 57 min / pass 43 / 3 videos', () => {
    expect(MOCK_TOTAL).toBe(50);
    expect(MOCK_DURATION_MS).toBe(3_420_000);
    expect(MOCK_PASS_MARK).toBe(43);
    expect(MOCK_VIDEO_COUNT).toBe(3);
  });
});

describe('exclusion window formula', () => {
  it('matches the spec table at every anchor pool size', () => {
    const table: Array<[number, number]> = [
      [100, 1],
      [120, 1],
      [150, 2],
      [199, 2],
      [200, 3],
      [300, 3],
      [350, 3],
    ];
    for (const [pool, want] of table) {
      expect(exclusionWindow(pool), `pool ${pool}`).toBe(want);
    }
  });

  it('is never negative and is 0 at or below 99', () => {
    for (const pool of [0, 10, 49, 50, 51, 99]) {
      expect(exclusionWindow(pool), `pool ${pool}`).toBe(0);
    }
  });
});

describe('generateMock invariants (property, 1000 seeded generations)', () => {
  it('always 50 unique questions from the pool, exactly 3 videos, ≥minSigns signs', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const rng = lcg(seed);
      const size = 50 + Math.floor(rng() * 300);
      const videos = 3 + Math.floor(rng() * 10);
      const signs = 5 + Math.floor(rng() * 20);
      const pool = makePool({ size, videos, signs });
      const paper = generateMock(pool, [], BP, rng);

      expect(paper.questionIds).toHaveLength(50);
      expect(new Set(paper.questionIds).size).toBe(50);
      const byId = new Map(pool.map((q) => [q.id, q]));
      for (const id of paper.questionIds) expect(byId.has(id)).toBe(true);
      const chosen = paper.questionIds.map((id) => byId.get(id)!);
      expect(chosen.filter((q) => q.video).length).toBe(3);
      expect(chosen.filter((q) => q.sign).length).toBeGreaterThanOrEqual(BP.minSigns);
      expect(paper.videoQuestionIds).toHaveLength(3);
      for (const id of paper.videoQuestionIds) expect(byId.get(id)!.video).toBe(true);
    }
  });

  it('is deterministic for the same seed and pool', () => {
    const pool = makePool({ size: 200, videos: 6, signs: 12 });
    const a = generateMock(pool, [], BP, lcg(42));
    const b = generateMock(pool, [], BP, lcg(42));
    expect(a.questionIds).toEqual(b.questionIds);
  });
});

describe('exclusion window application and relaxation', () => {
  it('excludes questions asked within the window (pool 150 → window 2)', () => {
    const pool = makePool({ size: 150, videos: 8, signs: 20 });
    const first = generateMock(pool, [], BP, lcg(1));
    const second = generateMock(pool, [attempt(first.questionIds, 1000)], BP, lcg(2));
    // window 2 covers the single attempt: zero overlap with it
    const firstSet = new Set(first.questionIds);
    expect(second.questionIds.filter((id) => firstSet.has(id))).toHaveLength(0);
    expect(second.exclusionWindow).toBe(2);
  });

  it('only the last `window` attempts are excluded (older attempts are fair game)', () => {
    const pool = makePool({ size: 120, videos: 8, signs: 20 }); // window 1
    const old = pool.slice(0, 50).map((q) => q.id);
    const recent = pool.slice(50, 100).map((q) => q.id);
    const paper = generateMock(pool, [attempt(old, 1000), attempt(recent, 2000)], BP, lcg(3));
    const recentSet = new Set(recent);
    expect(paper.questionIds.filter((id) => recentSet.has(id))).toHaveLength(0);
    expect(paper.exclusionWindow).toBe(1);
  });

  it('relaxes the window rather than failing when exclusions starve the blueprint', () => {
    // pool 120 → window 1, but the pool has exactly 3 videos and the most recent
    // attempt used all of them: window 1 leaves 0 eligible videos, so the window
    // must relax to 0 and still produce a legal paper.
    const pool = makePool({ size: 120, videos: 3, signs: 20 });
    const videoIds = pool.filter((q) => q.video).map((q) => q.id);
    const filler = pool
      .filter((q) => !q.video)
      .slice(0, 47)
      .map((q) => q.id);
    const paper = generateMock(pool, [attempt([...videoIds, ...filler], 1000)], BP, lcg(4));
    expect(paper.questionIds).toHaveLength(50);
    expect(paper.videoQuestionIds).toHaveLength(3);
    expect(paper.exclusionWindow).toBe(0);
  });

  it('throws loudly when the blueprint is unfillable even at window 0', () => {
    expect(() => generateMock(makePool({ size: 49, videos: 3, signs: 5 }), [], BP, lcg(5))).toThrow();
    expect(() => generateMock(makePool({ size: 100, videos: 2, signs: 5 }), [], BP, lcg(6))).toThrow();
    expect(() => generateMock(makePool({ size: 100, videos: 3, signs: 4 }), [], BP, lcg(7))).toThrow();
  });

  it('pool of exactly 50 with a legal composition generates with window 0 despite history', () => {
    const pool = makePool({ size: 50, videos: 3, signs: 5 });
    const all = pool.map((q) => q.id);
    const paper = generateMock(pool, [attempt(all, 1000)], BP, lcg(8));
    expect(paper.questionIds).toHaveLength(50);
    expect(paper.exclusionWindow).toBe(0);
  });
});

// vB.2: the real bank is 731 car (non-video) + 27 video = 758. Non-video route shares
// match the ingested distribution; route-2 questions are the road-sign questions.
const REAL_NON_VIDEO: Record<string, number> = {
  'route-1': 63,
  'route-2': 112,
  'route-3': 156,
  'route-4': 67,
  'route-5': 57,
  'route-6': 91,
  'route-7': 185,
};

function realShapePool(): MockPoolQuestion[] {
  const pool: MockPoolQuestion[] = [];
  let n = 0;
  for (const [routeId, count] of Object.entries(REAL_NON_VIDEO)) {
    for (let i = 0; i < count; i++) {
      pool.push({ id: `c${n++}`, routeId, video: false, sign: routeId === 'route-2' });
    }
  }
  for (let i = 0; i < 27; i++) pool.push({ id: `v${i}`, routeId: 'route-3', video: true, sign: false });
  return pool;
}

describe('routeQuotaFromShares — proportional floor by non-video route share', () => {
  it('distributes a 47-question budget across the real route shares by floor', () => {
    const quota = routeQuotaFromShares(realShapePool(), 47);
    expect(quota).toEqual({
      'route-1': 4,
      'route-2': 7,
      'route-3': 10,
      'route-4': 4,
      'route-5': 3,
      'route-6': 5,
      'route-7': 11,
    });
    const sum = Object.values(quota).reduce((a, b) => a + b, 0);
    expect(sum).toBeLessThanOrEqual(47);
  });

  it('ignores video questions and never exceeds a route’s available non-video count', () => {
    const pool = realShapePool();
    const quota = routeQuotaFromShares(pool, 47);
    for (const [routeId, want] of Object.entries(quota)) {
      expect(want).toBeLessThanOrEqual(REAL_NON_VIDEO[routeId]!);
    }
    expect(quota['route-3']).toBeLessThan(REAL_NON_VIDEO['route-3']!); // 27 videos not counted
  });
});

describe('generateMock — per-route quotas (real pool size)', () => {
  const quota = routeQuotaFromShares(realShapePool(), 47);
  const BP_REAL: Blueprint = { total: 50, videoCount: 3, minSigns: 4, routeQuota: quota };

  it('exclusion window is 3 at the real pool size', () => {
    expect(exclusionWindow(758)).toBe(3);
  });

  it('every seeded paper honours the quota per route, 50/3-video/≥minSigns, window 3', () => {
    const pool = realShapePool();
    const byId = new Map(pool.map((q) => [q.id, q]));
    for (let seed = 1; seed <= 200; seed++) {
      const paper = generateMock(pool, [], BP_REAL, lcg(seed));
      expect(paper.questionIds).toHaveLength(50);
      expect(new Set(paper.questionIds).size).toBe(50);
      expect(paper.exclusionWindow).toBe(3);

      const chosen = paper.questionIds.map((id) => byId.get(id)!);
      const nonVideo = chosen.filter((q) => !q.video);
      expect(chosen.filter((q) => q.video)).toHaveLength(3);
      expect(nonVideo.filter((q) => q.sign).length).toBeGreaterThanOrEqual(BP_REAL.minSigns);
      for (const [routeId, want] of Object.entries(quota)) {
        const got = nonVideo.filter((q) => q.routeId === routeId).length;
        expect(got, `route ${routeId} seed ${seed}`).toBeGreaterThanOrEqual(want);
      }
    }
  });

  it('is deterministic for the same seed', () => {
    const pool = realShapePool();
    const a = generateMock(pool, [], BP_REAL, lcg(7));
    const b = generateMock(pool, [], BP_REAL, lcg(7));
    expect(a.questionIds).toEqual(b.questionIds);
  });
});

describe('generateMock — quotas are soft (best-effort, never throw)', () => {
  it('a route with fewer non-video questions than its quota gets all it has; the rest fills elsewhere', () => {
    // route-5 has only 1 non-video question but the quota asks for 3.
    const pool: MockPoolQuestion[] = [];
    let n = 0;
    const counts: Record<string, number> = {
      'route-1': 20,
      'route-2': 20,
      'route-5': 1,
      'route-7': 20,
    };
    for (const [routeId, count] of Object.entries(counts)) {
      for (let i = 0; i < count; i++) {
        pool.push({ id: `c${n++}`, routeId, video: false, sign: routeId === 'route-2' });
      }
    }
    for (let i = 0; i < 5; i++) pool.push({ id: `v${i}`, routeId: 'route-1', video: true, sign: false });

    const bp: Blueprint = {
      total: 50,
      videoCount: 3,
      minSigns: 4,
      routeQuota: { 'route-1': 10, 'route-2': 10, 'route-5': 3, 'route-7': 10 },
    };
    const paper = generateMock(pool, [], bp, lcg(3));
    const byId = new Map(pool.map((q) => [q.id, q]));
    const nonVideo = paper.questionIds.map((id) => byId.get(id)!).filter((q) => !q.video);
    expect(paper.questionIds).toHaveLength(50);
    // route-5 contributes its one and only non-video question, not three
    expect(nonVideo.filter((q) => q.routeId === 'route-5')).toHaveLength(1);
  });

  it('a blueprint with no routeQuota behaves exactly as before (backward compatible)', () => {
    const pool = makePool({ size: 200, videos: 6, signs: 12 });
    const paper = generateMock(pool, [], BP, lcg(11));
    expect(paper.questionIds).toHaveLength(50);
    expect(paper.videoQuestionIds).toHaveLength(3);
  });
});

describe('timer is wall-clock arithmetic', () => {
  it('remaining time derives from startedAt + duration, clamped at 0', () => {
    const startedAt = 1_700_000_000_000;
    expect(mockRemainingMs(startedAt, startedAt)).toBe(MOCK_DURATION_MS);
    expect(mockRemainingMs(startedAt, startedAt + 60_000)).toBe(MOCK_DURATION_MS - 60_000);
    expect(mockRemainingMs(startedAt, startedAt + MOCK_DURATION_MS)).toBe(0);
    expect(mockRemainingMs(startedAt, startedAt + MOCK_DURATION_MS + 1)).toBe(0);
  });

  it('a backward clock jump never grants more than the locked duration', () => {
    const startedAt = 1_700_000_000_000;
    expect(mockRemainingMs(startedAt, startedAt - 3_600_000)).toBe(MOCK_DURATION_MS);
  });
});

describe('scoring', () => {
  it('pass mark boundary at exactly 43', () => {
    expect(scoreMock(42)).toEqual({ correct: 42, passed: false });
    expect(scoreMock(43)).toEqual({ correct: 43, passed: true });
    expect(scoreMock(50)).toEqual({ correct: 50, passed: true });
  });
});
