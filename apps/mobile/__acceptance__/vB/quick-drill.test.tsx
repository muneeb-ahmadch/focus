// @vitest-environment jsdom
// vB.5 gate: the two CURRICULUM engine folds are wired through the app.
// (P1-4) Readiness route_coverage is yield-weighted by each route's bank share —
// finishing only route-1 reports its ~14% slice of the bank, never a full 1.0.
// (P1-2) When completed missions can seed a 5-Q cross-route quick-drill, Home
// shows a "Quick drill" CTA interleaved before the new mission, and tapping it
// starts a drill session.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import HomeScreen from '../../app/(tabs)/index';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';
import { getRouteManifest } from '@/content';
import { addDaysLocal, toLocalDay } from '@/lib/clock';
import { createProfile } from '@/db/repo/profile';
import { completeMission, ensureMissionRow } from '@/db/repo/missions';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { buildStats } from '@/lib/stats';
import { getRouteBankShares } from '@/lib/mockPool';
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
  createProfile(db, { testDate: addDaysLocal(TODAY, 30), dailyMinutesTarget: 10 });
});

afterEach(() => {
  cleanup();
  usePlayerStore.setState({ active: false, mode: 'mission', queue: [] });
});

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HomeScreen />
    </QueryClientProvider>,
  );
}

function buttonTexts(): string[] {
  return screen.getAllByRole('button').map((b) => b.textContent ?? '');
}

function completeFirstMissions(n: number): void {
  const missions = ['r1-m1', 'r1-m2', 'r1-m3', 'r1-m4', 'r1-m5'].slice(0, n);
  for (const id of missions) {
    ensureMissionRow(db, id, 'route-1');
    completeMission(db, id, 5);
  }
}

describe('P1-4 — yield-weighted route coverage', () => {
  it('route-1 fully complete reports its bank share, never full coverage', () => {
    db.run(`UPDATE route_state SET completed_missions = total_missions WHERE route_id = 'route-1'`);
    const share = getRouteBankShares()['route-1']!;
    const coverage = buildStats(db).inputs.routeCoverage;
    expect(coverage).toBeCloseTo(share, 10);
    expect(coverage).toBeGreaterThan(0);
    expect(coverage).toBeLessThan(1); // honest: only ~1/7 of the exam is covered
  });

  it('no completed content → zero coverage', () => {
    expect(buildStats(db).inputs.routeCoverage).toBe(0);
  });
});

describe('P1-2 — interleaved cross-route quick-drill on Home', () => {
  it('with completed missions the Quick drill CTA shows, interleaved before the mission', async () => {
    completeFirstMissions(3);
    renderHome();
    await screen.findByText(/today.?s plan/i);

    const texts = buttonTexts();
    const drillIdx = texts.findIndex((t) => /quick drill/i.test(t));
    const missionIdx = texts.findIndex((t) => /start today.?s mission/i.test(t));
    expect(drillIdx).toBeGreaterThanOrEqual(0);
    expect(missionIdx).toBeGreaterThan(drillIdx);
  });

  it('no completed missions → no Quick drill CTA', async () => {
    renderHome();
    await screen.findByText(/today.?s plan/i);
    expect(screen.queryByRole('button', { name: /quick drill/i })).toBeNull();
  });

  it('tapping Quick drill starts a drill session and opens the player', async () => {
    completeFirstMissions(3);
    renderHome();
    await screen.findByText(/today.?s plan/i);

    fireEvent.click(screen.getByRole('button', { name: /quick drill/i }));
    const store = usePlayerStore.getState();
    expect(store.active).toBe(true);
    expect(store.mode).toBe('drill');
    expect(store.queue.length).toBeGreaterThanOrEqual(1);
    expect(store.queue.length).toBeLessThanOrEqual(5);
    expect(JSON.stringify(h.push.mock.calls)).toContain('/player');
  });
});
