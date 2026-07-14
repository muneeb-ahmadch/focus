// Slice v10 gate: practice sets are deterministic samples over a filtered
// pool — topic / route / weak-concepts — that refuse to build a thin session
// (< PRACTICE_MIN_POOL) instead of fronting one. Mini mock is a parameterised
// strict paper: 10 questions, no videos, 11:24 wall-clock, pass 9; it reuses
// generateMock/mockRemainingMs rather than a second timer implementation.
import { describe, expect, it } from 'vitest';
import {
  buildPracticeSet,
  filterPracticePool,
  generateMock,
  MINI_MOCK_BLUEPRINT,
  MINI_MOCK_DURATION_MS,
  MINI_MOCK_PASS_MARK,
  MOCK_DURATION_MS,
  mockRemainingMs,
  PRACTICE_MIN_POOL,
  type MockPoolQuestion,
  type PracticePoolQuestion,
} from '../src';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function pq(
  id: string,
  conceptId: string,
  routeId: string,
  topic: string,
): PracticePoolQuestion {
  return { id, conceptId, routeId, topic };
}

const pool: PracticePoolQuestion[] = [
  ...Array.from({ length: 11 }, (_, i) => pq(`l${i}`, `c.lights.q${i % 4}`, 'route-1', 'lights')),
  ...Array.from({ length: 7 }, (_, i) => pq(`s${i}`, `c.speed.q${i % 3}`, 'route-1', 'speed')),
  ...Array.from({ length: 3 }, (_, i) => pq(`g${i}`, `c.signs.q${i}`, 'route-1', 'signs')),
  ...Array.from({ length: 6 }, (_, i) => pq(`r2${i}`, `c.other.q${i % 2}`, 'route-2', 'other')),
];

describe('locked constants', () => {
  it('minimum viable pool is 5; mini mock is 10 questions / 0 videos / 0 sign floor / 684000 ms / pass 9', () => {
    expect(PRACTICE_MIN_POOL).toBe(5);
    expect(MINI_MOCK_BLUEPRINT).toEqual({ total: 10, videoCount: 0, minSigns: 0 });
    expect(MINI_MOCK_DURATION_MS).toBe(684_000);
    expect(MINI_MOCK_PASS_MARK).toBe(9);
  });
});

describe('filterPracticePool', () => {
  it('topic filter keeps exactly that concept family', () => {
    const got = filterPracticePool(pool, { kind: 'topic', topic: 'speed' });
    expect(got).toHaveLength(7);
    expect(got.every((q) => q.topic === 'speed')).toBe(true);
  });

  it('route filter keeps exactly that route', () => {
    const got = filterPracticePool(pool, { kind: 'route', routeId: 'route-2' });
    expect(got).toHaveLength(6);
    expect(got.every((q) => q.routeId === 'route-2')).toBe(true);
  });

  it('weak filter keeps only questions whose concept is listed', () => {
    const got = filterPracticePool(pool, {
      kind: 'weak',
      conceptIds: ['c.lights.q0', 'c.speed.q1'],
    });
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((q) => q.conceptId === 'c.lights.q0' || q.conceptId === 'c.speed.q1')).toBe(
      true,
    );
  });
});

describe('buildPracticeSet', () => {
  it('returns null when the filtered pool is thinner than PRACTICE_MIN_POOL', () => {
    expect(buildPracticeSet(pool, { kind: 'topic', topic: 'signs' }, 10, lcg(1))).toBeNull();
    expect(buildPracticeSet(pool, { kind: 'weak', conceptIds: [] }, 10, lcg(1))).toBeNull();
    expect(
      buildPracticeSet(pool, { kind: 'topic', topic: 'does-not-exist' }, 10, lcg(1)),
    ).toBeNull();
  });

  it('a pool of exactly PRACTICE_MIN_POOL builds a full-pool session', () => {
    const five = pool.filter((q) => q.topic === 'lights').slice(0, 5);
    const got = buildPracticeSet(five, { kind: 'topic', topic: 'lights' }, 10, lcg(2));
    expect(got).not.toBeNull();
    expect([...got!].sort()).toEqual(five.map((q) => q.id).sort());
  });

  it('clamps to the filtered pool when the request is larger', () => {
    const got = buildPracticeSet(pool, { kind: 'topic', topic: 'speed' }, 20, lcg(3));
    expect(got).toHaveLength(7);
  });

  it('samples exactly the requested length when the pool allows', () => {
    const got = buildPracticeSet(pool, { kind: 'topic', topic: 'lights' }, 10, lcg(4));
    expect(got).toHaveLength(10);
  });

  it('is deterministic for a given rng seed', () => {
    const a = buildPracticeSet(pool, { kind: 'route', routeId: 'route-1' }, 10, lcg(5));
    const b = buildPracticeSet(pool, { kind: 'route', routeId: 'route-1' }, 10, lcg(5));
    expect(a).toEqual(b);
  });

  it('property: 200 seeds — ids unique, drawn from the filtered pool, correct length', () => {
    const lightIds = new Set(pool.filter((q) => q.topic === 'lights').map((q) => q.id));
    for (let seed = 1; seed <= 200; seed++) {
      const got = buildPracticeSet(pool, { kind: 'topic', topic: 'lights' }, 10, lcg(seed))!;
      expect(got).toHaveLength(10);
      expect(new Set(got).size).toBe(10);
      for (const id of got) expect(lightIds.has(id)).toBe(true);
    }
  });
});

describe('mockRemainingMs duration parameter', () => {
  it('two-argument form still clamps to the full 57-minute paper', () => {
    expect(mockRemainingMs(1_000, 1_000)).toBe(MOCK_DURATION_MS);
    expect(mockRemainingMs(1_000, 1_000 + MOCK_DURATION_MS)).toBe(0);
  });

  it('honours a mini-mock duration: full at start, zero at expiry, never beyond', () => {
    expect(mockRemainingMs(1_000, 1_000, MINI_MOCK_DURATION_MS)).toBe(MINI_MOCK_DURATION_MS);
    expect(mockRemainingMs(1_000, 1_000 + MINI_MOCK_DURATION_MS, MINI_MOCK_DURATION_MS)).toBe(0);
    expect(mockRemainingMs(1_000, 500, MINI_MOCK_DURATION_MS)).toBe(MINI_MOCK_DURATION_MS);
    expect(mockRemainingMs(1_000, 1_000 + MINI_MOCK_DURATION_MS + 5_000, MINI_MOCK_DURATION_MS)).toBe(
      0,
    );
  });
});

describe('mini mock paper via generateMock', () => {
  const mockPool: MockPoolQuestion[] = [
    ...Array.from({ length: 3 }, (_, i) => ({
      id: `v${i}`,
      routeId: 'route-1',
      video: true,
      sign: false,
    })),
    { id: 'sg0', routeId: 'route-1', video: false, sign: true },
    ...Array.from({ length: 53 }, (_, i) => ({
      id: `q${i}`,
      routeId: 'route-1',
      video: false,
      sign: false,
    })),
  ];

  it('yields 10 unique questions with zero videos, ignoring history', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const paper = generateMock(mockPool, [], MINI_MOCK_BLUEPRINT, lcg(seed));
      expect(paper.questionIds).toHaveLength(10);
      expect(new Set(paper.questionIds).size).toBe(10);
      expect(paper.videoQuestionIds).toHaveLength(0);
      expect(paper.questionIds.some((id) => id.startsWith('v'))).toBe(false);
    }
  });
});
