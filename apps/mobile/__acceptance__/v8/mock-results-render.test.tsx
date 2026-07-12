// @vitest-environment jsdom
// Slice v8 gate: the results surface at the real component tree (R5). The
// runner hands off to /mock/results on submit or expiry; MockResults states
// score, pass mark, and pass state factually (rule 2 bans coaching INSIDE the
// runner; results are post-submit and still stay sober — no confetti copy),
// routes mistakes to MistakeReview, confirms saved weak concepts, and offers
// RebuildWeakRoute only when one route caused 3+ mistakes.
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MockResultsScreen from '../../app/mock/results';
import MistakeReviewScreen from '../../app/mock/mistakes';
import MockRunnerScreen from '../../app/mock/runner';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';
import { ROUTES } from '@/content';
import { getMockPool } from '@/lib/mockPool';
import { useMockStore } from '@/stores/mockStore';

const START_MS = 1_780_000_000_000;

const h = vi.hoisted(() => ({
  db: null as unknown,
  nowMs: 0,
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: h.replace, back: h.back, push: h.push },
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

// Phrase-matched, not bare words — real DVSA content contains "correct"/
// "wrong"/"great" legitimately (same ruling as v7's runner sweep).
const COACHING = /well done|that.?s right|not quite|try again|keep going|streak|\bxp\b|hint/i;

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  h.db = db;
  h.nowMs = START_MS;
  h.push.mockClear();
  h.replace.mockClear();
  h.back.mockClear();
  useMockStore.setState(useMockStore.getInitialState());
});

afterEach(() => {
  cleanup();
});

const q = (id: string) => getMockPool().questionById.get(id)!;
const rightOption = (id: string) => q(id).options.find((o) => o.correct)!;
const wrongOption = (id: string) => q(id).options.find((o) => !o.correct)!;

function submitWith(wrongIds: string[], correctIds: string[]): void {
  useMockStore.getState().startMock();
  for (const id of wrongIds) useMockStore.getState().answer(id, wrongOption(id).id);
  for (const id of correctIds) useMockStore.getState().answer(id, rightOption(id).id);
  useMockStore.getState().requestSubmit();
  useMockStore.getState().confirmSubmit();
}

describe('runner hands off to the results screen', () => {
  it('submitting navigates to /mock/results instead of rendering a score inline', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    useMockStore.getState().answer(ids[0]!, rightOption(ids[0]!).id);
    render(<MockRunnerScreen />);
    act(() => {
      useMockStore.getState().requestSubmit();
    });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(useMockStore.getState().phase).toBe('submitted');
    expect(JSON.stringify(h.replace.mock.calls)).toContain('/mock/results');
  });

  it('expiry navigates to /mock/results with the attempt auto_submitted', () => {
    useMockStore.getState().startMock();
    render(<MockRunnerScreen />);
    h.nowMs = START_MS + 3_420_000 + 1;
    act(() => {
      useMockStore.getState().tick();
    });
    expect(useMockStore.getState().phase).toBe('expired');
    expect(JSON.stringify(h.replace.mock.calls)).toContain('/mock/results');
    const row = db.get<{ status: string }>(`SELECT status FROM attempt WHERE attempt_type = 'mock'`);
    expect(row?.status).toBe('auto_submitted');
  });
});

describe('MockResults', () => {
  it('below the pass mark: score, pass mark, factual state, mistakes count, saved concepts — no coaching', () => {
    useMockStore.getState().startMock();
    const ids0 = useMockStore.getState().paper!.questionIds;
    useMockStore.getState().answer(ids0[0]!, wrongOption(ids0[0]!).id);
    useMockStore.getState().answer(ids0[1]!, wrongOption(ids0[1]!).id);
    useMockStore.getState().answer(ids0[2]!, rightOption(ids0[2]!).id);
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();

    const { container } = render(<MockResultsScreen />);
    screen.getByText(/mock complete/i);
    screen.getByText(/1\s*\/\s*50/);
    screen.getByText(/pass mark:?\s*43/i);
    screen.getByText(/below pass mark/i);
    screen.getByText(/2 wrong/);
    screen.getByText(/47 unanswered/);
    screen.getByText(/added to your review queue/i);
    expect(container.textContent).not.toMatch(COACHING);
  });

  it('at or above the pass mark it states Pass, factually', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    for (const id of ids.slice(0, 45)) useMockStore.getState().answer(id, rightOption(id).id);
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();

    const { container } = render(<MockResultsScreen />);
    screen.getByText(/45\s*\/\s*50/);
    screen.getByText(/^pass$/i);
    expect(container.textContent).not.toMatch(COACHING);
  });

  it("expired attempt: titled Time's up with the auto-submit explainer", () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    useMockStore.getState().answer(ids[0]!, rightOption(ids[0]!).id);
    h.nowMs = START_MS + 3_420_000 + 1;
    useMockStore.getState().tick();

    render(<MockResultsScreen />);
    screen.getByText(/time.?s up/i);
    screen.getByText(/submitted automatically/i);
    screen.getByText(/1\s*\/\s*50/);
  });

  it('Review mistakes routes to the mistake list; hidden when nothing is wrong', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    useMockStore.getState().answer(ids[0]!, wrongOption(ids[0]!).id);
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();

    render(<MockResultsScreen />);
    fireEvent.click(screen.getByRole('button', { name: /review mistakes/i }));
    expect(JSON.stringify(h.push.mock.calls)).toContain('/mock/mistakes');
    cleanup();

    useMockStore.setState(useMockStore.getInitialState());
    submitWith([], []);
    render(<MockResultsScreen />);
    expect(screen.queryByRole('button', { name: /review mistakes/i })).toBeNull();
  });

  it('Fix them now leaves the mock and opens the review queue', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    useMockStore.getState().answer(ids[0]!, wrongOption(ids[0]!).id);
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();

    render(<MockResultsScreen />);
    fireEvent.click(screen.getByRole('button', { name: /fix them now/i }));
    expect(JSON.stringify(h.push.mock.calls) + JSON.stringify(h.replace.mock.calls)).toContain(
      '/review-queue',
    );
    expect(useMockStore.getState().phase).toBe('idle');
  });

  it('3+ mistakes from one route offer Rebuild with that route named; 1 mistake does not', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    for (const id of ids.slice(0, 4)) useMockStore.getState().answer(id, wrongOption(id).id);
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();

    render(<MockResultsScreen />);
    screen.getByText(new RegExp(ROUTES[0]!.title));
    fireEvent.click(screen.getByRole('button', { name: /rebuild this route/i }));
    expect(JSON.stringify(h.push.mock.calls) + JSON.stringify(h.replace.mock.calls)).toContain(
      ROUTES[0]!.routeId,
    );
    expect(useMockStore.getState().phase).toBe('idle');
    cleanup();

    h.push.mockClear();
    h.replace.mockClear();
    useMockStore.setState(useMockStore.getInitialState());
    useMockStore.getState().startMock();
    const ids2 = useMockStore.getState().paper!.questionIds;
    useMockStore.getState().answer(ids2[0]!, wrongOption(ids2[0]!).id);
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();
    render(<MockResultsScreen />);
    expect(screen.queryByRole('button', { name: /rebuild this route/i })).toBeNull();
  });

  it('Done resets the mock and returns to the tabs — double-tap fires once (R6)', () => {
    submitWith([], []);
    render(<MockResultsScreen />);
    const done = screen.getByRole('button', { name: /done/i });
    fireEvent.click(done);
    fireEvent.click(done);
    expect(useMockStore.getState().phase).toBe('idle');
    const tabNavs = [...h.replace.mock.calls].filter((c) => JSON.stringify(c).includes('(tabs)'));
    expect(tabNavs.length).toBe(1);
  });
});

describe('MistakeReview', () => {
  it('lists each wrong question with the chosen and correct answers, no coaching, no re-answering', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    const wrongIds = [ids[0]!, ids[1]!];
    for (const id of wrongIds) useMockStore.getState().answer(id, wrongOption(id).id);
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();

    const { container } = render(<MistakeReviewScreen />);
    for (const id of wrongIds) {
      screen.getByText(q(id).prompt);
      screen.getAllByText(wrongOption(id).text);
      screen.getAllByText(rightOption(id).text);
    }
    screen.getAllByText(/your answer/i);
    screen.getAllByText(/correct answer/i);
    expect(container.textContent).not.toMatch(COACHING);
  });
});
