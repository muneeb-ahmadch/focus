// @vitest-environment jsdom
// Slice v10 gate: the mini mock is a strict 10-question paper that reuses the
// mock machinery but is bookkept as PRACTICE — it must never feed readiness
// mock_trend (getMockScores), never bump mocks_completed (day credit), never
// burn the real mock's exclusion history, and never resurface through
// MockStart's dangling-mock prompt. Wrong answers still feed the review queue.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MINI_MOCK_DURATION_MS, MINI_MOCK_PASS_MARK } from '@focus/engine';
import MiniMockScreen from '../../app/practice/mini-mock';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';
import { getMockScores } from '@/db/repo/attempts';
import { getMockPool } from '@/lib/mockPool';
import { MINI_MOCK_CONFIG, peekDanglingMock, useMockStore } from '@/stores/mockStore';

const START_MS = 1_780_000_000_000;

const h = vi.hoisted(() => ({
  db: null as unknown,
  nowMs: 0,
  push: vi.fn(),
  back: vi.fn(),
  focusCb: null as null | (() => void),
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { push: h.push, back: h.back, replace: vi.fn() },
  useFocusEffect: (cb: () => void) => {
    h.focusCb = cb; // captured so a test can simulate returning to the screen
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(cb, [cb]);
  },
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
vi.mock('@/notifications/scheduler', () => ({
  rescheduleAll: async () => {},
  requestPermissionOnce: async () => {},
}));

let db: Db;

const question = (id: string) => getMockPool().questionById.get(id)!;
const correctOf = (id: string) => question(id).options.find((o) => o.correct)!;
const wrongOf = (id: string) => question(id).options.find((o) => !o.correct)!;

const today = () => {
  const d = new Date(h.nowMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
};

function startMini(): void {
  useMockStore.getState().startMock(MINI_MOCK_CONFIG);
}

function answerN(correct: number, wrong: number): void {
  const ids = useMockStore.getState().paper!.questionIds;
  for (let i = 0; i < correct; i++)
    useMockStore.getState().answer(ids[i]!, correctOf(ids[i]!).id);
  for (let i = correct; i < correct + wrong; i++)
    useMockStore.getState().answer(ids[i]!, wrongOf(ids[i]!).id);
}

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  h.db = db;
  h.nowMs = START_MS;
  h.push.mockClear();
  useMockStore.setState(useMockStore.getInitialState());
});

afterEach(() => {
  cleanup();
});

describe('mini mock paper', () => {
  it('starts a 10-question video-free paper on a PRACTICE attempt', () => {
    startMini();
    const s = useMockStore.getState();
    expect(s.phase).toBe('running');
    expect(s.paper!.questionIds).toHaveLength(10);
    expect(s.paper!.videoQuestionIds).toHaveLength(0);

    const attempt = db.get<{ attempt_type: string; content_id: string }>(
      'SELECT attempt_type, content_id FROM attempt ORDER BY attempt_id DESC',
    );
    expect(attempt).toEqual({ attempt_type: 'practice', content_id: 'mini-mock' });
  });

  it('pass boundary sits at MINI_MOCK_PASS_MARK: 9 passes, 8 does not', () => {
    startMini();
    answerN(MINI_MOCK_PASS_MARK, 10 - MINI_MOCK_PASS_MARK);
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();
    expect(useMockStore.getState().score).toBe(9);
    expect(useMockStore.getState().passed).toBe(true);

    useMockStore.getState().discard();
    startMini();
    answerN(MINI_MOCK_PASS_MARK - 1, 0);
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();
    expect(useMockStore.getState().passed).toBe(false);
  });

  it('expires on the mini clock, not the 57-minute one', () => {
    startMini();
    h.nowMs = START_MS + MINI_MOCK_DURATION_MS + 1;
    useMockStore.getState().tick();
    expect(useMockStore.getState().phase).toBe('expired');
    const attempt = db.get<{ status: string }>(
      `SELECT status FROM attempt WHERE content_id = 'mini-mock'`,
    );
    expect(attempt?.status).toBe('auto_submitted');
  });

  it('wrong answers land in the review queue once per concept, origin wrong', () => {
    startMini();
    answerN(0, 3);
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();

    const items = db.all<{ origin_type: string }>('SELECT origin_type FROM review_item');
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.origin_type === 'wrong')).toBe(true);
  });
});

describe('mini mock is bookkept as practice — real-mock isolation', () => {
  it('a submitted mini mock never reaches getMockScores, mocks_completed, or the day-credit path', () => {
    startMini();
    answerN(10, 0);
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();

    expect(getMockScores(db)).toEqual([]);
    const activity = db.get<{ mocks_completed: number }>(
      'SELECT mocks_completed FROM daily_activity WHERE day = ?',
      [today()],
    );
    expect(activity?.mocks_completed ?? 0).toBe(0);
  });

  it('a dangling in_progress mini mock is invisible to MockStart and swept by the next start', () => {
    startMini();
    useMockStore.setState(useMockStore.getInitialState()); // app reload mid-paper

    expect(peekDanglingMock()).toBeNull();

    startMini();
    const rows = db.all<{ status: string }>(
      `SELECT status FROM attempt WHERE content_id = 'mini-mock' ORDER BY attempt_id`,
    );
    expect(rows).toEqual([{ status: 'abandoned' }, { status: 'in_progress' }]);
  });

  it('starting a mini mock never destroys a resumable REAL paper (self-heal stays mock-path-only)', () => {
    useMockStore.getState().startMock(); // real paper…
    useMockStore.setState(useMockStore.getInitialState()); // …killed mid-mock

    startMini();
    const real = db.get<{ status: string }>(
      `SELECT status FROM attempt WHERE attempt_type = 'mock'`,
    );
    expect(real?.status).toBe('in_progress');
    expect(peekDanglingMock()).toBe('live');
  });

  it('a real mock started after a mini mock still builds a full 50-question paper', () => {
    startMini();
    answerN(5, 5);
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();
    useMockStore.getState().discard();

    useMockStore.getState().startMock();
    expect(useMockStore.getState().paper!.questionIds).toHaveLength(50);
    expect(useMockStore.getState().runConfig.contentId).toBe('mock');
  });
});

describe('mini mock intro screen', () => {
  it('states the paper honestly and starts it once (R6)', () => {
    render(<MiniMockScreen />);
    expect(screen.getByText(/10 questions/i)).toBeTruthy();
    expect(screen.getByText(new RegExp(`pass mark ${MINI_MOCK_PASS_MARK}`, 'i'))).toBeTruthy();

    const start = screen.getByRole('button', { name: /start/i });
    fireEvent.click(start);
    fireEvent.click(start);

    expect(useMockStore.getState().phase).toBe('running');
    expect(useMockStore.getState().runConfig.contentId).toBe('mini-mock');
    expect(
      db.all(`SELECT attempt_id FROM attempt WHERE content_id = 'mini-mock'`),
    ).toHaveLength(1);
    const navs = h.push.mock.calls.filter((c) => JSON.stringify(c).includes('/mock/runner'));
    expect(navs).toHaveLength(1);
  });

  it('Start, back out of the runner, Resume — all on the SAME mounted instance (guard unburns on refocus)', () => {
    render(<MiniMockScreen />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(useMockStore.getState().phase).toBe('running');

    act(() => h.focusCb?.()); // hardware-back from the runner refocuses this screen
    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    const navs = h.push.mock.calls.filter((c) => JSON.stringify(c).includes('/mock/runner'));
    expect(navs).toHaveLength(2);
  });

  it('QA V10-Q1: a live REAL mock is never discardable from here — intro blocks with Resume only', () => {
    useMockStore.getState().startMock(); // the real 50-question paper
    render(<MiniMockScreen />);

    expect(screen.queryByRole('button', { name: /discard/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /start mini mock/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    expect(JSON.stringify(h.push.mock.calls)).toContain('/mock/runner');
    expect(useMockStore.getState().runConfig.contentId).toBe('mock');
    const real = db.get<{ status: string }>(
      `SELECT status FROM attempt WHERE attempt_type = 'mock'`,
    );
    expect(real?.status).toBe('in_progress');
  });

  it('offers Resume/Discard for a live in-session mini mock instead of a dead Start', () => {
    startMini();
    render(<MiniMockScreen />);
    expect(screen.getByRole('button', { name: /resume/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));

    expect(useMockStore.getState().phase).toBe('idle');
    const attempt = db.get<{ status: string }>(
      `SELECT status FROM attempt WHERE content_id = 'mini-mock'`,
    );
    expect(attempt?.status).toBe('abandoned');
    expect(screen.getByRole('button', { name: /start/i })).toBeTruthy();
  });
});
