// @vitest-environment jsdom
// Slice v6 gate: RouteOverview enforces the mission ladder. The first
// incomplete mission is the only tappable entry point into the player;
// later missions are locked; completing a mission unlocks the next.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RouteOverviewScreen from '../../app/route/[routeId]';
import { getRouteManifest, getRouteMissions } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { completeMission, ensureMissionRow } from '@/db/repo/missions';
import { createProfile } from '@/db/repo/profile';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { queryClient } from '@/lib/queryClient';

const h = vi.hoisted(() => ({
  db: null as unknown,
  push: vi.fn(),
  params: { routeId: 'route-1' } as { routeId: string },
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: () => {}, back: () => {}, push: h.push },
  useLocalSearchParams: () => h.params,
  Stack: { Screen: () => null },
}));
vi.mock('@/components/MasteryBar', () => ({ MasteryBar: () => null }));

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  syncRoutesFromContent(db, getRouteManifest());
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
  h.db = db;
  h.push.mockClear();
  h.params = { routeId: 'route-1' };
  queryClient.clear();
});

afterEach(cleanup);

function renderOverview() {
  return render(
    <QueryClientProvider client={queryClient}>
      <RouteOverviewScreen />
    </QueryClientProvider>,
  );
}

describe('RouteOverview mission ladder', () => {
  it('only the first mission is open on a fresh route; tapping it enters the player', async () => {
    renderOverview();

    const first = await screen.findByRole('button', { name: /mission 1/i });
    fireEvent.click(first);
    expect(h.push).toHaveBeenCalledTimes(1);
    const pushed = JSON.stringify(h.push.mock.calls[0]);
    expect(pushed).toContain('/player');
    expect(pushed).toContain(getRouteMissions('route-1')[0]!.missionId);
  });

  it('tapping a locked mission does not enter the player', async () => {
    renderOverview();

    fireEvent.click(await screen.findByRole('button', { name: /mission 2/i }));
    expect(h.push).not.toHaveBeenCalled();
  });

  it('completing mission 1 unlocks mission 2', async () => {
    const missions = getRouteMissions('route-1');
    ensureMissionRow(db, missions[0]!.missionId, 'route-1');
    completeMission(db, missions[0]!.missionId, 1);

    renderOverview();

    fireEvent.click(await screen.findByRole('button', { name: /mission 2/i }));
    expect(h.push).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.push.mock.calls[0])).toContain(missions[1]!.missionId);
  });

  it('an unknown routeId renders a not-found message, not a crash', () => {
    h.params = { routeId: 'route-99' };
    renderOverview();
    screen.getByText(/isn't available/i);
  });
});
