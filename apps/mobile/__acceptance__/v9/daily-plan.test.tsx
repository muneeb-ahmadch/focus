// @vitest-environment jsdom
// Slice v9 gate: Home renders the engine-built daily plan — ordered items with
// working CTAs — and the plan reflows the moment the test date moves closer.
// The v6-era hardcoded route-1 CTA chain is gone; what renders is
// buildDailyPlan output resolved against real content.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import HomeScreen from '../../app/(tabs)/index';
import ProgressScreen from '../../app/(tabs)/progress';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';
import { getRouteManifest } from '@/content';
import { addDaysLocal, toLocalDay } from '@/lib/clock';
import { createProfile, updateTestDate } from '@/db/repo/profile';
import { ensureMissionRow, saveResume } from '@/db/repo/missions';
import { upsertMiss } from '@/db/repo/reviews';
import { syncRoutesFromContent } from '@/db/repo/routes';

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
  SafeAreaView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('@/notifications/scheduler', () => ({
  rescheduleAll: async () => {},
  requestPermissionOnce: async () => {},
}));
vi.mock('@/components/DevPanel', () => ({ DevPanel: () => null }));
vi.mock('@/flags', () => ({ MOCKS_ENABLED: true }));

const TODAY = toLocalDay(new Date(START_MS));

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  h.db = db;
  h.nowMs = START_MS;
  h.push.mockClear();
  h.replace.mockClear();
  syncRoutesFromContent(db, getRouteManifest());
});

afterEach(() => {
  cleanup();
});

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HomeScreen />
    </QueryClientProvider>,
  );
}

const navJson = () => JSON.stringify(h.push.mock.calls) + JSON.stringify(h.replace.mock.calls);

function buttonTexts(): string[] {
  return screen.getAllByRole('button').map((b) => b.textContent ?? '');
}

function seedDueReviews(count: number): void {
  const yesterday = addDaysLocal(TODAY, -1);
  for (let i = 0; i < count; i++) upsertMiss(db, `c.seed.${i}`, 'wrong', yesterday);
}

describe('Home daily plan card', () => {
  it('fresh user, test far out: the plan leads with the mission — no mock, no reviews', async () => {
    createProfile(db, { testDate: addDaysLocal(TODAY, 30), dailyMinutesTarget: 10 });
    renderHome();
    await screen.findByText(/today.?s plan/i);
    const mission = screen.getByRole('button', { name: /start today.?s mission/i });
    expect(screen.queryByRole('button', { name: /sit a mock/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /clear .* review/i })).toBeNull();
    screen.getByText(/6 min/i);

    fireEvent.click(mission);
    expect(navJson()).toContain('/player');
    expect(navJson()).toContain('r1-m1');
  });

  it('urgent review debt (>10) is ordered before the mission and routes to the queue', async () => {
    createProfile(db, { testDate: addDaysLocal(TODAY, 30), dailyMinutesTarget: 10 });
    seedDueReviews(12);
    renderHome();
    await screen.findByText(/today.?s plan/i);

    const texts = buttonTexts();
    const reviewsIdx = texts.findIndex((t) => /clear 12 reviews/i.test(t));
    const missionIdx = texts.findIndex((t) => /start today.?s mission/i.test(t));
    expect(reviewsIdx).toBeGreaterThanOrEqual(0);
    expect(missionIdx).toBeGreaterThan(reviewsIdx);

    fireEvent.click(screen.getByRole('button', { name: /clear 12 reviews/i }));
    expect(navJson()).toContain('/review-queue');
  });

  it('light review debt (≤10) is ordered after the mission', async () => {
    createProfile(db, { testDate: addDaysLocal(TODAY, 30), dailyMinutesTarget: 10 });
    seedDueReviews(3);
    renderHome();
    await screen.findByText(/today.?s plan/i);

    const texts = buttonTexts();
    const missionIdx = texts.findIndex((t) => /start today.?s mission/i.test(t));
    const reviewsIdx = texts.findIndex((t) => /clear 3 reviews/i.test(t));
    expect(missionIdx).toBeGreaterThanOrEqual(0);
    expect(reviewsIdx).toBeGreaterThan(missionIdx);
  });

  it('an in-progress mission leads the plan and resumes exactly that mission', async () => {
    createProfile(db, { testDate: addDaysLocal(TODAY, 30), dailyMinutesTarget: 10 });
    seedDueReviews(12);
    ensureMissionRow(db, 'r1-m2', 'route-1');
    saveResume(db, 'r1-m2', 3, '{"v":1}');
    renderHome();
    await screen.findByText(/today.?s plan/i);

    const texts = buttonTexts();
    const resumeIdx = texts.findIndex((t) => /continue/i.test(t));
    const reviewsIdx = texts.findIndex((t) => /clear 12 reviews/i.test(t));
    expect(resumeIdx).toBeGreaterThanOrEqual(0);
    expect(reviewsIdx).toBeGreaterThan(resumeIdx);

    fireEvent.click(screen.getAllByRole('button')[resumeIdx]!);
    expect(navJson()).toContain('/player');
    expect(navJson()).toContain('r1-m2');
  });

  it('never offers the resumable mission twice: resume CTA suppresses a mission item resolving to the same mission', async () => {
    createProfile(db, { testDate: addDaysLocal(TODAY, 30), dailyMinutesTarget: 10 });
    ensureMissionRow(db, 'r1-m1', 'route-1');
    saveResume(db, 'r1-m1', 2, '{"v":1}');
    renderHome();
    await screen.findByText(/today.?s plan/i);

    screen.getByRole('button', { name: /continue/i });
    expect(screen.queryByRole('button', { name: /start today.?s mission/i })).toBeNull();
  });

  it('inside 14 days the plan escalates a mock, ordered last, routed to /mock', async () => {
    createProfile(db, { testDate: addDaysLocal(TODAY, 10), dailyMinutesTarget: 10 });
    renderHome();
    await screen.findByText(/today.?s plan/i);

    const texts = buttonTexts();
    const missionIdx = texts.findIndex((t) => /start today.?s mission/i.test(t));
    const mockIdx = texts.findIndex((t) => /sit a mock/i.test(t));
    expect(missionIdx).toBeGreaterThanOrEqual(0);
    expect(mockIdx).toBeGreaterThan(missionIdx);

    fireEvent.click(screen.getByRole('button', { name: /sit a mock/i }));
    expect(navJson()).toContain('/mock');
  });

  it('final days (<3): missions drop out — reviews and mock only', async () => {
    createProfile(db, { testDate: addDaysLocal(TODAY, 2), dailyMinutesTarget: 10 });
    seedDueReviews(2);
    renderHome();
    await screen.findByText(/today.?s plan/i);

    expect(screen.queryByRole('button', { name: /start today.?s mission/i })).toBeNull();
    screen.getByRole('button', { name: /clear 2 reviews/i });
    screen.getByRole('button', { name: /sit a mock/i });
  });

  it('moving the test date closer reflows the plan on the next render', async () => {
    createProfile(db, { testDate: addDaysLocal(TODAY, 30), dailyMinutesTarget: 10 });
    const first = renderHome();
    await screen.findByText(/today.?s plan/i);
    expect(screen.queryByRole('button', { name: /sit a mock/i })).toBeNull();
    first.unmount();

    updateTestDate(db, addDaysLocal(TODAY, 2));
    renderHome();
    await screen.findByText(/today.?s plan/i);
    screen.getByRole('button', { name: /sit a mock/i });
    expect(screen.queryByRole('button', { name: /start today.?s mission/i })).toBeNull();
  });

  // QA V9-Q3: two open missions across routes — the mission slot must never
  // claim "Start" on a mission that already has saved progress.
  it('a second in-progress mission relabels the mission CTA to Continue, never Start', async () => {
    createProfile(db, { testDate: addDaysLocal(TODAY, 30), dailyMinutesTarget: 10 });
    ensureMissionRow(db, 'r1-m1', 'route-1');
    saveResume(db, 'r1-m1', 2, '{"v":1}');
    h.nowMs = START_MS + 60_000;
    ensureMissionRow(db, 'r1-m2', 'route-1');
    saveResume(db, 'r1-m2', 1, '{"v":1}');
    renderHome();
    await screen.findByText(/today.?s plan/i);

    screen.getByRole('button', { name: /continue mission 2/i });
    screen.getByRole('button', { name: /continue mission 1/i });
    expect(screen.queryByRole('button', { name: /start today.?s mission/i })).toBeNull();
  });

  it('everything cleared: an honest all-caught-up state, no invented CTA', async () => {
    createProfile(db, { testDate: addDaysLocal(TODAY, 30), dailyMinutesTarget: 10 });
    db.run(`UPDATE route_state SET completed_missions = total_missions`);
    renderHome();
    await screen.findByText(/all caught up/i);
    expect(screen.queryByRole('button', { name: /start today.?s mission/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /sit a mock/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /clear .* review/i })).toBeNull();
  });
});

// QA V9-Q1: the countdown line rendered raw diffDaysLocal — "Your test is in
// -3 days" / "in 0 days". Copy must branch on past/today/tomorrow, on EVERY
// surface that renders it (Home and Progress share the helper).
describe('test countdown copy (Home + Progress)', () => {
  function renderProgress() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <ProgressScreen />
      </QueryClientProvider>,
    );
  }

  it('a past test date never renders a negative count — it says the date has passed', async () => {
    createProfile(db, { testDate: addDaysLocal(TODAY, -3), dailyMinutesTarget: 10 });
    renderHome();
    await screen.findByText(/today.?s plan/i);
    screen.getByText(/test date has passed/i);
    expect(screen.queryByText(/-\d+ day/)).toBeNull();
  });

  it('test today and test tomorrow read as words, not numbers', async () => {
    createProfile(db, { testDate: TODAY, dailyMinutesTarget: 10 });
    const first = renderHome();
    await screen.findByText(/your test is today/i);
    expect(screen.queryByText(/in 0 days/i)).toBeNull();
    first.unmount();

    updateTestDate(db, addDaysLocal(TODAY, 1));
    renderHome();
    await screen.findByText(/your test is tomorrow/i);
    expect(screen.queryByText(/in 1 day/i)).toBeNull();
  });

  it('Progress renders the same guarded copy for a past date', async () => {
    createProfile(db, { testDate: addDaysLocal(TODAY, -3), dailyMinutesTarget: 10 });
    renderProgress();
    await screen.findByText(/test date has passed/i);
    expect(screen.queryByText(/-\d+ day/)).toBeNull();
  });
});
