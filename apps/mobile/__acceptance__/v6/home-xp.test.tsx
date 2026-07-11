// @vitest-environment jsdom
// Slice v6 gate: earned XP is visible where the user starts their day.
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomeScreen from '../../app/(tabs)/index';
import { getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { addXp } from '@/db/repo/activity';
import { createProfile } from '@/db/repo/profile';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { todayLocal } from '@/lib/clock';
import { queryClient } from '@/lib/queryClient';

const h = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: () => {}, back: () => {}, push: () => {} },
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
  syncRoutesFromContent(db, getRouteManifest());
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
  h.db = db;
  queryClient.clear();
});

afterEach(cleanup);

function renderHome() {
  return render(
    <QueryClientProvider client={queryClient}>
      <HomeScreen />
    </QueryClientProvider>,
  );
}

describe('Home shows total XP', () => {
  it('fresh install shows 0 XP', async () => {
    renderHome();
    expect(await screen.findByText(/0 XP/)).toBeTruthy();
  });

  it('ledger total is displayed', async () => {
    addXp(db, todayLocal(), 60);
    addXp(db, todayLocal(), 15);
    renderHome();
    expect(await screen.findByText(/75 XP/)).toBeTruthy();
  });
});
