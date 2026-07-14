// @vitest-environment jsdom
// Slice v10 gate: the practice surface never fronts a thin broken session.
// Topics below PRACTICE_MIN_POOL are hidden from the picker entirely, and any
// path that still resolves to a thin pool (weak areas, tampered params)
// renders PoolUnavailable instead of a session. Weak areas = every open
// review item (active or snoozed), not just due-today.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRACTICE_MIN_POOL } from '@focus/engine';
import PracticeConfigScreen from '../../app/practice/config';
import PracticeHubScreen from '../../app/(tabs)/practice';
import { ROUTES } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';
import { snoozeItem, upsertMiss } from '@/db/repo/reviews';
import { getPracticePool, getPracticeTopics, getWeakConceptIds } from '@/lib/practicePool';
import { getMockPool } from '@/lib/mockPool';
import { usePlayerStore } from '@/stores/playerStore';

const START_MS = 1_780_000_000_000;

const h = vi.hoisted(() => ({
  db: null as unknown,
  nowMs: 0,
  push: vi.fn(),
  back: vi.fn(),
  params: {} as Record<string, string>,
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { push: h.push, back: h.back, replace: vi.fn() },
  useFocusEffect: () => {},
  useLocalSearchParams: () => h.params,
}));
vi.mock('@/lib/clock', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/clock')>();
  return {
    ...real,
    now: () => new Date(h.nowMs),
    todayLocal: () => real.toLocalDay(new Date(h.nowMs)),
  };
});
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: import('react').ReactNode }) => <>{children}</>,
}));
vi.mock('@/notifications/scheduler', () => ({
  rescheduleAll: async () => {},
  requestPermissionOnce: async () => {},
}));

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  h.db = db;
  h.nowMs = START_MS;
  h.push.mockClear();
  h.back.mockClear();
  h.params = {};
  usePlayerStore.setState(usePlayerStore.getInitialState());
});

afterEach(() => {
  cleanup();
});

describe('practice pool derivation', () => {
  it('every pool question resolves in the mock pool index and carries its concept family as topic', () => {
    const pool = getPracticePool();
    expect(pool.length).toBeGreaterThan(0);
    const { questionById } = getMockPool();
    for (const q of pool) {
      expect(questionById.has(q.id)).toBe(true);
      expect(q.topic).toBe(q.conceptId.split('.')[1]);
    }
  });

  it('topics list = families at or above PRACTICE_MIN_POOL, thin families hidden', () => {
    const counts = new Map<string, number>();
    for (const q of getPracticePool()) counts.set(q.topic, (counts.get(q.topic) ?? 0) + 1);

    const topics = getPracticeTopics();
    const expected = [...counts.entries()].filter(([, n]) => n >= PRACTICE_MIN_POOL);
    expect(topics).toHaveLength(expected.length);
    for (const t of topics) {
      expect(counts.get(t.topic)).toBe(t.count);
      expect(t.count).toBeGreaterThanOrEqual(PRACTICE_MIN_POOL);
      expect(t.label.length).toBeGreaterThan(0);
    }
    // spot pins against today's authored pack
    expect(topics.some((t) => t.topic === 'lights')).toBe(true);
    expect(topics.some((t) => t.topic === 'signs')).toBe(false);
    expect(topics.some((t) => t.topic === 'hazard')).toBe(false);
  });

  it('weak concepts = open review items including snoozed, excluding cleared', () => {
    upsertMiss(db, 'c.lights.night', 'wrong', '2026-07-10');
    upsertMiss(db, 'c.speed.default-limits', 'unsure', '2026-07-10');
    snoozeItem(db, 'c.speed.default-limits', '2026-07-11');
    upsertMiss(db, 'c.markings.hatched', 'wrong', '2026-07-10');
    db.run(`UPDATE review_item SET status = 'cleared' WHERE concept_id = 'c.markings.hatched'`);

    expect(getWeakConceptIds(db).sort()).toEqual(['c.lights.night', 'c.speed.default-limits']);
  });
});

describe('PracticeHub', () => {
  it('renders the four practice tiles and routes each one', () => {
    render(<PracticeHubScreen />);
    fireEvent.click(screen.getByText(/topic test/i));
    fireEvent.click(screen.getByText(/route test/i));
    fireEvent.click(screen.getByText(/fix weak areas/i));
    fireEvent.click(screen.getByText(/mini mock/i));

    const calls = JSON.stringify(h.push.mock.calls);
    expect(calls).toContain('topic');
    expect(calls).toContain('route');
    expect(calls).toContain('weak');
    expect(calls).toContain('mini-mock');
  });
});

describe('PracticeConfig — topic', () => {
  it('offers only viable topics and starts a session of the chosen length', () => {
    h.params = { kind: 'topic' };
    render(<PracticeConfigScreen />);

    expect(screen.queryByText(/^signs$/i)).toBeNull();
    fireEvent.click(screen.getByText(/^lights$/i));
    fireEvent.click(screen.getByText(/10 questions/i));
    fireEvent.click(screen.getByRole('button', { name: /start/i }));

    const s = usePlayerStore.getState();
    expect(s.active).toBe(true);
    expect(s.mode).toBe('practice');
    expect(s.queue).toHaveLength(10);
    expect(s.queue.every((c) => getMockPool().questionById.get(c.stepId)?.conceptId.startsWith('c.lights'))).toBe(
      true,
    );
    expect(JSON.stringify(h.push.mock.calls)).toContain('/player');
  });

  it('R6: hammering Start opens one attempt and one navigation', () => {
    h.params = { kind: 'topic' };
    render(<PracticeConfigScreen />);
    fireEvent.click(screen.getByText(/^lights$/i));
    fireEvent.click(screen.getByText(/10 questions/i));
    const start = screen.getByRole('button', { name: /start/i });
    fireEvent.click(start);
    fireEvent.click(start);

    expect(db.all(`SELECT attempt_id FROM attempt WHERE attempt_type = 'practice'`)).toHaveLength(1);
    const navs = h.push.mock.calls.filter((c) => JSON.stringify(c).includes('/player'));
    expect(navs).toHaveLength(1);
  });
});

describe('PracticeConfig — route', () => {
  it('offers only authored routes and builds a route-scoped session', () => {
    h.params = { kind: 'route' };
    render(<PracticeConfigScreen />);

    fireEvent.click(screen.getByText(ROUTES[0]!.title));
    fireEvent.click(screen.getByText(/10 questions/i));
    fireEvent.click(screen.getByRole('button', { name: /start/i }));

    const s = usePlayerStore.getState();
    expect(s.active).toBe(true);
    expect(s.queue).toHaveLength(10);
    expect(
      s.queue.every((c) => getMockPool().questionById.get(c.stepId)?.routeId === 'route-1'),
    ).toBe(true);
  });
});

describe('PracticeConfig — weak areas / PoolUnavailable', () => {
  it('empty review queue → nothing-to-fix state, no session, no crash', () => {
    h.params = { kind: 'weak' };
    render(<PracticeConfigScreen />);

    expect(screen.getByText(/nothing to fix right now/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /start/i })).toBeNull();
    expect(usePlayerStore.getState().active).toBe(false);
  });

  it('weak pool thinner than PRACTICE_MIN_POOL → PoolUnavailable, never a thin session', () => {
    const pool = getPracticePool();
    const thinConcept = [...new Set(pool.map((q) => q.conceptId))].find(
      (c) => pool.filter((q) => q.conceptId === c).length < PRACTICE_MIN_POOL,
    )!;
    upsertMiss(db, thinConcept, 'wrong', '2026-07-10');

    h.params = { kind: 'weak' };
    render(<PracticeConfigScreen />);

    expect(screen.getByText(/not enough questions yet/i)).toBeTruthy();
    expect(usePlayerStore.getState().active).toBe(false);
  });

  it('a healthy weak pool builds a session over exactly the weak concepts', () => {
    const pool = getPracticePool();
    const byConcept = new Map<string, number>();
    for (const q of pool) byConcept.set(q.conceptId, (byConcept.get(q.conceptId) ?? 0) + 1);
    const weak: string[] = [];
    let n = 0;
    for (const [concept, count] of byConcept) {
      weak.push(concept);
      n += count;
      if (n >= PRACTICE_MIN_POOL) break;
    }
    for (const concept of weak) upsertMiss(db, concept, 'wrong', '2026-07-10');

    h.params = { kind: 'weak' };
    render(<PracticeConfigScreen />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));

    const s = usePlayerStore.getState();
    expect(s.active).toBe(true);
    expect(s.queue.length).toBeGreaterThanOrEqual(PRACTICE_MIN_POOL);
    expect(
      s.queue.every((c) => weak.includes(getMockPool().questionById.get(c.stepId)!.conceptId)),
    ).toBe(true);
  });
});
