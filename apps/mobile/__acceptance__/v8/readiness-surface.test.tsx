// @vitest-environment jsdom
// Slice v8 gate: the readiness surface never embarrasses itself (§6).
// Cold start (no mocks, <20 answers) shows NO number and NO band anywhere;
// <2 mocks shows the score labelled Provisional wherever it renders; ≥2 mocks
// drops the label and surfaces mock trend at 35%. The breakdown screen renders
// engine-computed components — it never recomputes weights itself.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import HomeScreen from '../../app/(tabs)/index';
import ProgressScreen from '../../app/(tabs)/progress';
import ReadinessBreakdownScreen from '../../app/readiness';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { finishAttempt, recordAnswer, startAttempt } from '@/db/repo/attempts';
import { createProfile } from '@/db/repo/profile';
import { openTestDb } from '@/db/testing/adapter.node';

const START_MS = 1_780_000_000_000;

const h = vi.hoisted(() => ({ db: null as unknown, nowMs: 0, push: vi.fn(), back: vi.fn(), replace: vi.fn() }));

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
  SafeAreaView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('@/notifications/scheduler', () => ({
  rescheduleAll: async () => {},
  requestPermissionOnce: async () => {},
}));
vi.mock('@/components/DevPanel', () => ({ DevPanel: () => null }));

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  h.db = db;
  h.nowMs = START_MS;
  h.push.mockClear();
  createProfile(db, { testDate: '2026-09-01', dailyMinutesTarget: 10 });
});

afterEach(() => {
  cleanup();
});

function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function seedScoredAnswers(count: number, correctEvery = 1): void {
  const attemptId = startAttempt(db, 'lesson', 'seed-mission');
  for (let i = 0; i < count; i++) {
    recordAnswer(db, attemptId, {
      stepId: `seed-step-${i}`,
      conceptId: `c.seed.${i}`,
      correct: i % correctEvery === 0,
      confidence: 'sure',
    });
  }
  finishAttempt(db, attemptId, 'submitted', count, null);
}

function seedFinishedMock(score: number): void {
  const attemptId = startAttempt(db, 'mock', 'mock');
  finishAttempt(db, attemptId, 'submitted', score, JSON.stringify({ questionIds: [], startedAt: h.nowMs }));
}

describe('Progress tab readiness card (§6 cold start)', () => {
  it('brand new user: the §6 unlock message, no number, no band, no Provisional label', async () => {
    renderWithQuery(<ProgressScreen />);
    await screen.findByText(/complete your first missions to unlock your readiness/i);
    expect(screen.queryByText(/provisional/i)).toBeNull();
    expect(screen.queryByText(/^(low|medium|high)$/i)).toBeNull();
    expect(screen.queryByText(/^\d{1,3}$/)).toBeNull();
  });

  it('19 scored answers and no mocks stays locked; 20 unlocks a provisional score', async () => {
    seedScoredAnswers(19);
    const first = renderWithQuery(<ProgressScreen />);
    await screen.findByText(/complete your first missions/i);
    expect(screen.queryByText(/^\d{1,3}$/)).toBeNull();
    first.unmount();

    seedScoredAnswers(1);
    renderWithQuery(<ProgressScreen />);
    await screen.findByText(/^\d{1,3}$/);
    screen.getByText(/provisional/i);
  });

  it('2 finished mocks: the score is no longer labelled provisional', async () => {
    seedScoredAnswers(25);
    seedFinishedMock(40);
    seedFinishedMock(45);
    renderWithQuery(<ProgressScreen />);
    await screen.findByText(/^\d{1,3}$/);
    expect(screen.queryByText(/provisional/i)).toBeNull();
  });

  it('the readiness card opens the breakdown screen', async () => {
    seedScoredAnswers(25);
    renderWithQuery(<ProgressScreen />);
    await screen.findByText(/^\d{1,3}$/);
    fireEvent.click(screen.getByRole('button', { name: /breakdown/i }));
    expect(JSON.stringify(h.push.mock.calls)).toContain('/readiness');
  });
});

// QA finding V8-Q1: Home rendered "Provisional" unconditionally next to the
// band chip. The label must track readiness.provisional on EVERY surface.
describe('Home readiness row (§6 label discipline)', () => {
  it('cold start: the §6 unlock line, no band, no Provisional', async () => {
    renderWithQuery(<HomeScreen />);
    await screen.findByText(/complete your first missions to unlock your readiness/i);
    expect(screen.queryByText(/provisional/i)).toBeNull();
    expect(screen.queryByText(/^(low|medium|high)$/i)).toBeNull();
  });

  it('<2 mocks: band renders WITH the Provisional label', async () => {
    seedScoredAnswers(25);
    renderWithQuery(<HomeScreen />);
    await screen.findByText(/^(low|medium|high)$/i);
    screen.getByText(/provisional/i);
  });

  it('≥2 mocks: band renders WITHOUT the Provisional label', async () => {
    seedScoredAnswers(25);
    seedFinishedMock(40);
    seedFinishedMock(45);
    renderWithQuery(<HomeScreen />);
    await screen.findByText(/^(low|medium|high)$/i);
    expect(screen.queryByText(/provisional/i)).toBeNull();
  });
});

describe('ReadinessBreakdown screen', () => {
  it('locked state repeats the §6 message, never a phantom component list', async () => {
    renderWithQuery(<ReadinessBreakdownScreen />);
    await screen.findByText(/complete your first missions to unlock your readiness/i);
    expect(screen.queryByText(/mock trend/i)).toBeNull();
    expect(screen.queryByText(/^\d{1,3}$/)).toBeNull();
  });

  it('provisional mode: 4 components with renormalised weights, no mock trend row, provisional explained', async () => {
    seedScoredAnswers(25);
    renderWithQuery(<ReadinessBreakdownScreen />);
    await screen.findByText(/provisional/i);
    expect(screen.queryByText(/mock trend/i)).toBeNull();
    screen.getByText(/coverage/i);
    screen.getByText(/review debt/i);
    screen.getByText(/accuracy/i);
    screen.getByText(/consistency/i);
    // .25/.65 and .10/.65 — the §6 renormalisation, rounded for display
    screen.getByText(/38%/);
    screen.getByText(/15%/);
  });

  it('full mode: mock trend leads at 35% and the provisional label is gone', async () => {
    seedScoredAnswers(25);
    seedFinishedMock(40);
    seedFinishedMock(45);
    renderWithQuery(<ReadinessBreakdownScreen />);
    await screen.findByText(/mock trend/i);
    screen.getByText(/35%/);
    screen.getByText(/25%/);
    expect(screen.queryByText(/provisional/i)).toBeNull();
  });
});
