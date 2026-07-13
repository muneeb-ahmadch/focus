// @vitest-environment jsdom
// Slice v9 gate — V8-D1 ruling: MockResults "Fix them now" must DO the fixing.
// It starts a fresh drill over exactly the concepts the paper just saved
// (MissionComplete parity), never dumping the learner on a due-now-filtered
// queue where the just-added items (due tomorrow) are invisible.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MockResultsScreen from '../../app/mock/results';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';
import { getMockPool } from '@/lib/mockPool';
import { useMockStore } from '@/stores/mockStore';
import { usePlayerStore } from '@/stores/playerStore';

const START_MS = 1_780_000_000_000;

const h = vi.hoisted(() => ({ db: null as unknown, nowMs: 0, push: vi.fn(), replace: vi.fn() }));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: h.replace, back: () => {}, push: h.push },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
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
  h.replace.mockClear();
  useMockStore.setState(useMockStore.getInitialState());
  usePlayerStore.setState(usePlayerStore.getInitialState());
});

afterEach(() => {
  cleanup();
});

const q = (id: string) => getMockPool().questionById.get(id)!;
const wrongOption = (id: string) => q(id).options.find((o) => !o.correct)!;

// Two wrong answers on DISTINCT concepts so savedConceptIds has two entries.
function submitWithTwoDistinctMisses(): void {
  useMockStore.getState().startMock();
  const ids = useMockStore.getState().paper!.questionIds;
  const first = ids[0]!;
  const second = ids.find((id) => q(id).conceptId !== q(first).conceptId)!;
  useMockStore.getState().answer(first, wrongOption(first).id);
  useMockStore.getState().answer(second, wrongOption(second).id);
  useMockStore.getState().requestSubmit();
  useMockStore.getState().confirmSubmit();
}

describe('MockResults → Fix them now (V8-D1)', () => {
  it('starts a fresh drill over exactly the saved concepts and opens the player', () => {
    submitWithTwoDistinctMisses();
    const saved = [...useMockStore.getState().savedConceptIds];
    expect(saved).toHaveLength(2);

    render(<MockResultsScreen />);
    fireEvent.click(screen.getByRole('button', { name: /fix them now/i }));

    expect(JSON.stringify(h.replace.mock.calls)).toContain('/player');
    const player = usePlayerStore.getState();
    expect(player.mode).toBe('drill');
    expect(player.active).toBe(true);
    const queueConcepts = player.queue
      .filter((c): c is Extract<typeof c, { kind: 'drill-q' }> => c.kind === 'drill-q')
      .map((c) => c.conceptId);
    expect([...queueConcepts].sort()).toEqual([...saved].sort());

    const drill = db.get<{ status: string; content_id: string }>(
      `SELECT status, content_id FROM attempt WHERE attempt_type = 'drill' ORDER BY attempt_id DESC`,
    );
    expect(drill).toEqual({ status: 'in_progress', content_id: 'fresh-drill' });
    expect(useMockStore.getState().phase).toBe('idle');
  });

  it('double-tap fires once (R6): one drill attempt, one navigation', () => {
    submitWithTwoDistinctMisses();
    render(<MockResultsScreen />);
    const cta = screen.getByRole('button', { name: /fix them now/i });
    fireEvent.click(cta);
    fireEvent.click(cta);

    const drills = db.all<{ attempt_id: number }>(
      `SELECT attempt_id FROM attempt WHERE attempt_type = 'drill'`,
    );
    expect(drills).toHaveLength(1);
    const playerNavs = h.replace.mock.calls.filter((c) => JSON.stringify(c).includes('/player'));
    expect(playerNavs).toHaveLength(1);
  });
});
