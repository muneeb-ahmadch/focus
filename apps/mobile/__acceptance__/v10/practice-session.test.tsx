// @vitest-environment jsdom
// Slice v10 gate: practice mode is a lesson-feel question session with NO SRS
// side effects on correct answers and NO day credit — a wrong answer feeds the
// review queue exactly like a mission miss (upsertMiss, origin wrong), a
// correct answer just advances (no confidence step: nothing consumes it).
// XP = drillXp(correct); reviews_cleared is never bumped (that column is day
// credit, and practice deliberately isn't — Muneeb ruling v9).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drillXp } from '@focus/engine';
import { PlayerScreen } from '@/components/player/PlayerScreen';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';
import { getActiveDays } from '@/db/repo/activity';
import { getPracticePool } from '@/lib/practicePool';
import { getMockPool } from '@/lib/mockPool';
import { usePlayerStore } from '@/stores/playerStore';

const START_MS = 1_780_000_000_000;

const h = vi.hoisted(() => ({ db: null as unknown, nowMs: 0, back: vi.fn() }));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: vi.fn(), push: vi.fn(), back: h.back },
  useLocalSearchParams: () => ({}),
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
vi.mock('expo-speech', () => ({ speak: vi.fn(), stop: vi.fn(), isSpeakingAsync: async () => false }));
vi.mock('@/notifications/scheduler', () => ({
  rescheduleAll: async () => {},
  requestPermissionOnce: async () => {},
}));

let db: Db;

const today = () => {
  const d = new Date(h.nowMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
};

// A real bank topic with plenty of questions to build sessions from.
const TOPIC = 'signs';
const LABEL = `topic:${TOPIC}`;

function sessionIds(n: number): string[] {
  return getPracticePool()
    .filter((q) => q.topic === TOPIC)
    .slice(0, n)
    .map((q) => q.id);
}

const question = (id: string) => getMockPool().questionById.get(id)!;
const correctOf = (id: string) => question(id).options.find((o) => o.correct)!;
const wrongOf = (id: string) => question(id).options.find((o) => !o.correct)!;

// the authored explanation for a pool question, straight from the bank — practice is a
// learning surface, so feedback must carry it (the mock never does)
function contentExplanation(poolId: string): string {
  return question(poolId).explanation;
}

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  h.db = db;
  h.nowMs = START_MS;
  h.back.mockClear();
  usePlayerStore.setState(usePlayerStore.getInitialState());
});

afterEach(() => {
  cleanup();
});

describe('practice session lifecycle', () => {
  it('startPractice builds the queue and opens a practice attempt', () => {
    const ids = sessionIds(6);
    usePlayerStore.getState().startPractice(ids, LABEL);

    const s = usePlayerStore.getState();
    expect(s.mode).toBe('practice');
    expect(s.active).toBe(true);
    expect(s.queue.map((c) => c.stepId)).toEqual(ids);

    const attempt = db.get<{ attempt_type: string; content_id: string; status: string }>(
      'SELECT attempt_type, content_id, status FROM attempt ORDER BY attempt_id DESC',
    );
    expect(attempt).toEqual({
      attempt_type: 'practice',
      content_id: LABEL,
      status: 'in_progress',
    });
  });

  it('wrong answer → review item with origin wrong; correct answer → no review item', () => {
    const ids = sessionIds(2);
    usePlayerStore.getState().startPractice(ids, LABEL);

    usePlayerStore.getState().answer(wrongOf(ids[0]!).id);
    usePlayerStore.getState().advance();
    usePlayerStore.getState().answer(correctOf(ids[1]!).id);

    const items = db.all<{ concept_id: string; origin_type: string; status: string }>(
      'SELECT concept_id, origin_type, status FROM review_item',
    );
    expect(items).toEqual([
      { concept_id: question(ids[0]!).conceptId, origin_type: 'wrong', status: 'active' },
    ]);
  });

  it('correct answers advance without a confidence step and are recorded sure', () => {
    const ids = sessionIds(2);
    usePlayerStore.getState().startPractice(ids, LABEL);
    usePlayerStore.getState().answer(correctOf(ids[0]!).id);
    expect(usePlayerStore.getState().phase).toBe('feedback');
    usePlayerStore.getState().advance();
    expect(usePlayerStore.getState().index).toBe(1);

    const evt = db.get<{ correct: number; confidence: string }>(
      'SELECT correct, confidence FROM answer_event ORDER BY id ASC LIMIT 1',
    );
    expect(evt).toEqual({ correct: 1, confidence: 'sure' });
  });

  it('finish: attempt submitted with fraction score, XP = drillXp(correct), day NOT active', () => {
    const ids = sessionIds(5);
    usePlayerStore.getState().startPractice(ids, LABEL);
    for (let i = 0; i < ids.length; i++) {
      const option = i === 0 ? wrongOf(ids[i]!) : correctOf(ids[i]!);
      usePlayerStore.getState().answer(option.id);
      usePlayerStore.getState().advance();
    }

    expect(usePlayerStore.getState().phase).toBe('practice-summary');
    expect(usePlayerStore.getState().drillCorrect).toBe(4);

    const attempt = db.get<{ status: string; score: number }>(
      `SELECT status, score FROM attempt WHERE attempt_type = 'practice'`,
    );
    expect(attempt).toEqual({ status: 'submitted', score: 4 / 5 });

    const activity = db.get<{ reviews_cleared: number; xp: number }>(
      'SELECT reviews_cleared, xp FROM daily_activity WHERE day = ?',
      [today()],
    );
    expect(activity?.reviews_cleared).toBe(0);
    expect(activity?.xp).toBe(drillXp(4));
    expect(getActiveDays(db)).not.toContain(today());
  });

  it('R3/R6: double answer records once; double advance moves one card', () => {
    const ids = sessionIds(3);
    usePlayerStore.getState().startPractice(ids, LABEL);
    usePlayerStore.getState().answer(correctOf(ids[0]!).id);
    usePlayerStore.getState().answer(correctOf(ids[0]!).id);
    expect(db.all('SELECT id FROM answer_event')).toHaveLength(1);

    usePlayerStore.getState().advance();
    usePlayerStore.getState().advance();
    expect(usePlayerStore.getState().index).toBe(1);
    expect(usePlayerStore.getState().phase).toBe('card');
  });

  it('abandon mid-session marks the attempt abandoned and deactivates', () => {
    usePlayerStore.getState().startPractice(sessionIds(5), LABEL);
    usePlayerStore.getState().answer(correctOf(sessionIds(5)[0]!).id);
    usePlayerStore.getState().abandon();

    expect(usePlayerStore.getState().active).toBe(false);
    const attempt = db.get<{ status: string }>(
      `SELECT status FROM attempt WHERE attempt_type = 'practice'`,
    );
    expect(attempt?.status).toBe('abandoned');
  });
});

describe('practice session render (R5 walk)', () => {
  it('walks two cards through the real tree: Continue on correct feedback, never confidence chips; summary shows the score', () => {
    const ids = sessionIds(2);
    usePlayerStore.getState().startPractice(ids, LABEL);
    render(<PlayerScreen />);

    for (const id of ids) {
      fireEvent.click(screen.getByText(correctOf(id).text!));
      expect(screen.queryByText(/how did that feel|were you sure/i)).toBeNull();
      expect(screen.getByText(contentExplanation(id))).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    }

    expect(usePlayerStore.getState().phase).toBe('practice-summary');
    expect(screen.getByText(/2\/2/)).toBeTruthy();
    const done = screen.getByRole('button', { name: /done/i });
    fireEvent.click(done);
    expect(usePlayerStore.getState().active).toBe(false);
  });
});
