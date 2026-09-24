// vB.2 gate: the mock and practice pools are built from the real question bank, not the
// authored lesson pack. In tests the bank is the synthetic fixture (aliased at
// @/content/bank); production loads the licensed, git-excluded generated bank the same way.
// Assertions here derive expectations from BANK itself so the fixture can grow freely, with
// a few explicit spot-pins on the real-topic taxonomy.
import { describe, expect, it } from 'vitest';
import { generateMock, PRACTICE_MIN_POOL } from '@focus/engine';
import { BANK } from '@/content/bank';
import { getMockPool, MOCK_BLUEPRINT } from '@/lib/mockPool';
import { getPracticePool, getPracticeTopics } from '@/lib/practicePool';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('mock pool derives from the bank', () => {
  it('indexes every bank question by item, with video = clipId and sign = route-2', () => {
    const { pool, questionById } = getMockPool();
    expect(pool.length).toBe(BANK.questions.length);
    for (const q of BANK.questions) {
      const entry = questionById.get(q.item);
      expect(entry, q.item).toBeDefined();
      expect(entry!.routeId).toBe(q.routeId);
      expect(entry!.video).toBe(!!q.clipId);
      expect(entry!.sign).toBe(q.routeId === 'route-2');
      expect(entry!.prompt).toBe(q.prompt);
      expect(entry!.options.length).toBe(q.options.length);
    }
  });

  it('carries enough video and sign questions to fill the strict blueprint', () => {
    const { pool } = getMockPool();
    expect(pool.length).toBeGreaterThanOrEqual(MOCK_BLUEPRINT.total);
    expect(pool.filter((q) => q.video).length).toBeGreaterThanOrEqual(MOCK_BLUEPRINT.videoCount);
    expect(pool.filter((q) => q.sign).length).toBeGreaterThanOrEqual(MOCK_BLUEPRINT.minSigns);
  });

  it('MOCK_BLUEPRINT carries a per-route quota proportional to the non-video pool', () => {
    const { pool } = getMockPool();
    const quota = MOCK_BLUEPRINT.routeQuota!;
    expect(quota).toBeDefined();
    const sum = Object.values(quota).reduce((a, b) => a + b, 0);
    expect(sum).toBeLessThanOrEqual(MOCK_BLUEPRINT.total - MOCK_BLUEPRINT.videoCount);
    // biggest non-video route gets the biggest quota
    const nonVideoByRoute = new Map<string, number>();
    for (const q of pool) if (!q.video) nonVideoByRoute.set(q.routeId, (nonVideoByRoute.get(q.routeId) ?? 0) + 1);
    const biggest = [...nonVideoByRoute.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    for (const [routeId, count] of nonVideoByRoute) {
      if (count < (nonVideoByRoute.get(biggest) ?? 0)) {
        expect(quota[biggest]!).toBeGreaterThanOrEqual(quota[routeId] ?? 0);
      }
    }
  });

  it('a generated paper honours the route quota — the topic spread is visible, not lucky', () => {
    const { pool, questionById } = getMockPool();
    const quota = MOCK_BLUEPRINT.routeQuota!;
    for (let seed = 1; seed <= 50; seed++) {
      const paper = generateMock(pool, [], MOCK_BLUEPRINT, lcg(seed));
      expect(paper.questionIds).toHaveLength(50);
      const nonVideo = paper.questionIds.map((id) => questionById.get(id)!).filter((q) => !q.video);
      for (const [routeId, want] of Object.entries(quota)) {
        const got = nonVideo.filter((q) => q.routeId === routeId).length;
        expect(got, `route ${routeId} seed ${seed}`).toBeGreaterThanOrEqual(want);
      }
    }
  });
});

describe('practice pool derives from the bank', () => {
  it('excludes video questions and carries the topic-map slug as its topic', () => {
    const pool = getPracticePool();
    const videoItems = new Set(BANK.questions.filter((q) => q.clipId).map((q) => q.item));
    expect(pool.some((q) => videoItems.has(q.id))).toBe(false);
    for (const q of pool) {
      expect(q.topic).toBe(q.conceptId.split('.')[1]);
    }
    // every non-video bank question is present
    expect(pool.length).toBe(BANK.questions.filter((q) => !q.clipId).length);
  });

  it('topic picker offers the real topics at or above the minimum and hides thin ones', () => {
    const counts = new Map<string, number>();
    for (const q of getPracticePool()) counts.set(q.topic, (counts.get(q.topic) ?? 0) + 1);
    const topics = getPracticeTopics();
    const expected = [...counts.entries()].filter(([, n]) => n >= PRACTICE_MIN_POOL);
    expect(topics).toHaveLength(expected.length);
    for (const t of topics) {
      expect(t.count).toBeGreaterThanOrEqual(PRACTICE_MIN_POOL);
      expect(counts.get(t.topic)).toBe(t.count);
    }
    // real-topic spot-pins against the synthetic bank's slugs
    expect(topics.some((t) => t.topic === 'signs')).toBe(true);
    expect(topics.some((t) => t.topic === 'essential-documents')).toBe(false); // only 3 — thin
    expect(topics.some((t) => t.topic === 'video')).toBe(false); // video is mock-only
  });
});
