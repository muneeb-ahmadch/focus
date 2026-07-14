// @vitest-environment jsdom
// Slice v7 gate: the mock runner at the real component tree (R5 — walk ≥2
// consecutive questions), plus MockStart/resume-prompt and the review grid.
// The load-bearing assertion class: STRICT MODE — nothing the runner renders
// before submit may reveal correctness or coach. Since v8 the runner renders
// no score at all: terminal phases hand off to /mock/results.
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import MockStartScreen from '../../app/mock/index';
import MockRunnerScreen from '../../app/mock/runner';
import MockReviewGridScreen from '../../app/mock/review';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';
import { getMockPool } from '@/lib/mockPool';
import { useMockStore } from '@/stores/mockStore';

const START_MS = 1_780_000_000_000;

const h = vi.hoisted(() => ({
  db: null as unknown,
  nowMs: 0,
  push: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: h.replace, back: h.back, push: h.push },
  useFocusEffect: () => {},
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
  SafeAreaView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('@/notifications/scheduler', () => ({
  rescheduleAll: async () => {},
  requestPermissionOnce: async () => {},
}));

// Bare words like "correct"/"wrong" appear in real DVSA question text, so the
// rendered-output sweep matches feedback PHRASES; tripwire 6 holds the stricter
// line on source literals.
const COACHING = /well done|that.?s right|not quite|try again|keep going|streak|\bxp\b|hint/i;

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  h.db = db;
  h.nowMs = START_MS;
  h.push.mockClear();
  h.back.mockClear();
  h.replace.mockClear();
  useMockStore.setState(useMockStore.getInitialState());
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function q(questionId: string) {
  return getMockPool().questionById.get(questionId)!;
}

describe('MockRunner strict question flow', () => {
  it('walks two consecutive questions: each renders its own options, answering reveals nothing', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    const { container } = render(<MockRunnerScreen />);

    screen.getByText(q(ids[0]!).prompt);
    for (const option of q(ids[0]!).options) screen.getByText(option.text);

    fireEvent.click(screen.getByText(q(ids[0]!).options[0]!.text));
    expect(useMockStore.getState().answers[ids[0]!]).toBe(q(ids[0]!).options[0]!.id);
    expect(container.textContent).not.toMatch(COACHING);

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    screen.getByText(q(ids[1]!).prompt);
    for (const option of q(ids[1]!).options) screen.getByText(option.text);
    const staleOptions = q(ids[0]!).options.filter(
      (o) => !q(ids[1]!).options.some((n) => n.text === o.text),
    );
    for (const stale of staleOptions) expect(screen.queryByText(stale.text)).toBeNull();
    expect(container.textContent).not.toMatch(COACHING);
  });

  it('changing an answer re-records it; the selection is visible but never graded', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    render(<MockRunnerScreen />);

    fireEvent.click(screen.getByText(q(ids[0]!).options[0]!.text));
    fireEvent.click(screen.getByText(q(ids[0]!).options[1]!.text));
    expect(useMockStore.getState().answers[ids[0]!]).toBe(q(ids[0]!).options[1]!.id);
  });

  it('the countdown derives from the wall clock, not accumulated ticks', () => {
    vi.useFakeTimers();
    useMockStore.getState().startMock();
    render(<MockRunnerScreen />);

    screen.getByText('57:00');
    h.nowMs = START_MS + 125_000;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    screen.getByText('54:55');
  });

  it('flagging toggles from the runner and shows on the current question', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    render(<MockRunnerScreen />);

    fireEvent.click(screen.getByRole('button', { name: /flag/i }));
    expect(useMockStore.getState().flags).toContain(ids[0]!);
    fireEvent.click(screen.getByRole('button', { name: /flag/i }));
    expect(useMockStore.getState().flags).not.toContain(ids[0]!);
  });

  it('a video question renders the silent placeholder frame with its options', () => {
    useMockStore.getState().startMock();
    const s = useMockStore.getState();
    const videoId = s.paper!.videoQuestionIds[0]!;
    useMockStore.getState().goTo(s.paper!.questionIds.indexOf(videoId));
    render(<MockRunnerScreen />);

    screen.getByText(/silent video/i);
    for (const option of q(videoId).options) screen.getByText(option.text);
  });
});

describe('submit confirm, expiry, and the results handoff (v8: no score inside the runner)', () => {
  it('submit-confirm states the unanswered count; confirming hands off to /mock/results', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    const correct = q(ids[0]!).options.find((o) => o.correct)!;
    useMockStore.getState().answer(ids[0]!, correct.id);
    const { container } = render(<MockRunnerScreen />);

    act(() => {
      useMockStore.getState().requestSubmit();
    });
    screen.getByText(/49 unanswered/i);
    expect(container.textContent).not.toMatch(COACHING);

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(useMockStore.getState().phase).toBe('submitted');
    expect(JSON.stringify(h.replace.mock.calls)).toContain('/mock/results');
  });

  it('expiry auto-submits and hands off to /mock/results, no coaching en route', () => {
    useMockStore.getState().startMock();
    const { container } = render(<MockRunnerScreen />);

    h.nowMs = START_MS + 3_420_000 + 1;
    act(() => {
      useMockStore.getState().tick();
    });

    expect(JSON.stringify(h.replace.mock.calls)).toContain('/mock/results');
    expect(container.textContent).not.toMatch(COACHING);
    const row = db.get<{ status: string }>(`SELECT status FROM attempt WHERE attempt_type = 'mock'`);
    expect(row?.status).toBe('auto_submitted');
  });
});

describe('MockStart and the resume prompt', () => {
  it('fresh state offers Start; starting navigates to the runner', () => {
    render(<MockStartScreen />);
    fireEvent.click(screen.getByRole('button', { name: /start mock/i }));
    expect(useMockStore.getState().phase).toBe('running');
    expect(JSON.stringify(h.push.mock.calls)).toContain('/mock/runner');
  });

  it('a dangling in_progress mock shows the resume prompt; Resume continues it', () => {
    useMockStore.getState().startMock();
    useMockStore.setState(useMockStore.getInitialState());

    render(<MockStartScreen />);
    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    expect(useMockStore.getState().phase).toBe('running');
    expect(JSON.stringify(h.push.mock.calls)).toContain('/mock/runner');
  });

  it('an EXPIRED dangling mock never offers Resume/Discard — time ran out, the paper is final', () => {
    useMockStore.getState().startMock();
    useMockStore.setState(useMockStore.getInitialState());
    h.nowMs = START_MS + 3_420_000 + 1;

    render(<MockStartScreen />);
    expect(screen.queryByRole('button', { name: /resume/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /discard/i })).toBeNull();
    screen.getByText(/time ran out/i);

    fireEvent.click(screen.getByRole('button', { name: /view result/i }));
    const row = db.get<{ status: string }>(`SELECT status FROM attempt WHERE attempt_type = 'mock'`);
    expect(row?.status).toBe('auto_submitted');
    expect(JSON.stringify(h.push.mock.calls)).toContain('/mock/runner');
  });

  it('Discard on the resume prompt abandons the dangling attempt and offers Start', () => {
    useMockStore.getState().startMock();
    useMockStore.setState(useMockStore.getInitialState());

    render(<MockStartScreen />);
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    const row = db.get<{ status: string }>(`SELECT status FROM attempt WHERE attempt_type = 'mock'`);
    expect(row?.status).toBe('abandoned');
    screen.getByRole('button', { name: /start mock/i });
  });
});

describe('MockReviewGrid', () => {
  it('renders 50 cells reflecting answered/flagged state; tapping one jumps there', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    useMockStore.getState().answer(ids[0]!, q(ids[0]!).options[0]!.id);
    useMockStore.getState().toggleFlag(ids[3]!);
    render(<MockReviewGridScreen />);

    screen.getByRole('button', { name: 'Question 1, answered' });
    screen.getByRole('button', { name: 'Question 4, flagged, unanswered' });
    screen.getByRole('button', { name: 'Question 7, unanswered' });

    fireEvent.click(screen.getByRole('button', { name: 'Question 7, unanswered' }));
    expect(useMockStore.getState().index).toBe(6);
    expect(h.back).toHaveBeenCalled();
  });
});
