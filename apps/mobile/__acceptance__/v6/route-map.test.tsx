// @vitest-environment jsdom
// Slice v6 gate: Learn is a route map, not a single hardcoded route. Routes
// with content are tappable cards that open their RouteOverview; routes
// without content read as locked "coming soon" rows, not dead buttons.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LearnScreen from '../../app/(tabs)/learn';
import { getRouteManifest, ROUTES } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { createProfile } from '@/db/repo/profile';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { queryClient } from '@/lib/queryClient';

const h = vi.hoisted(() => ({
  db: null as unknown,
  push: vi.fn(),
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: () => {}, back: () => {}, push: h.push },
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
  queryClient.clear();
});

afterEach(cleanup);

function renderLearn() {
  return render(
    <QueryClientProvider client={queryClient}>
      <LearnScreen />
    </QueryClientProvider>,
  );
}

describe('Learn route map', () => {
  it('shows a tappable card per authored route and coming-soon rows for the rest', async () => {
    renderLearn();

    const routeOne = await screen.findByRole('button', { name: /route 1/i });
    expect(routeOne.textContent).toContain('missions');

    const emptyRoutes = ROUTES.filter((r) => r.missions.length === 0);
    expect(screen.getAllByText('Coming soon')).toHaveLength(emptyRoutes.length);
    for (const route of emptyRoutes) {
      expect(screen.queryByRole('button', { name: new RegExp(route.title, 'i') })).toBeNull();
    }
  });

  it('tapping an authored route opens its RouteOverview', async () => {
    renderLearn();

    fireEvent.click(await screen.findByRole('button', { name: /route 1/i }));
    expect(h.push).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.push.mock.calls[0])).toContain('/route/route-1');
  });
});
