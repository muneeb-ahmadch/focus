// @vitest-environment jsdom
// Slice v5 gate: ReviewQueue screen — due items listed with a human concept
// label and their origin, per-item Fix-now (rehab) and Snooze, a clear-all
// flow into the due drill, and an honest empty state. A snoozed item whose
// snooze has expired is back in the list.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import ReviewQueueScreen from '../../app/review-queue';
import { conceptLabel, getMission, getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { createProfile } from '@/db/repo/profile';
import { getAllReviewItems, snoozeItem, upsertMiss } from '@/db/repo/reviews';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { addDaysLocal, todayLocal } from '@/lib/clock';
import { queryClient } from '@/lib/queryClient';
import { usePlayerStore } from '@/stores/playerStore';

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
  useFocusEffect: () => {},
}));
vi.mock('@/notifications/scheduler', () => ({
  rescheduleAll: async () => {},
  requestPermissionOnce: async () => {},
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

let db: Db;

function twoConcepts(): [string, string] {
  const mission = getMission('r1-m1');
  if (!mission) throw new Error('no r1-m1');
  const ids = [
    ...new Set(mission.steps.filter((s) => s.type !== 'checkpoint').map((s) => s.conceptId)),
  ];
  if (ids.length < 2) throw new Error('need two concepts');
  return [ids[0]!, ids[1]!];
}

function renderScreen() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ReviewQueueScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  syncRoutesFromContent(db, getRouteManifest());
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
  h.db = db;
  h.push.mockClear();
  usePlayerStore.getState().abandon();
  queryClient.clear();
});

afterEach(cleanup);

describe('review queue screen', () => {
  it('lists due items with concept label and origin, and offers clear-all with the count', async () => {
    const [a, b] = twoConcepts();
    const yesterday = addDaysLocal(todayLocal(), -1);
    upsertMiss(db, a, 'wrong', yesterday);
    upsertMiss(db, b, 'hint_heavy', yesterday);

    renderScreen();

    expect(await screen.findByText(conceptLabel(a))).toBeTruthy();
    expect(screen.getByText(conceptLabel(b))).toBeTruthy();
    expect(screen.getByRole('button', { name: /clear all 2/i })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Fix now' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Snooze 3 days' })).toHaveLength(2);
  });

  it('clear-all starts the due drill with every due concept', async () => {
    const [a, b] = twoConcepts();
    const yesterday = addDaysLocal(todayLocal(), -1);
    upsertMiss(db, a, 'wrong', yesterday);
    upsertMiss(db, b, 'unsure', yesterday);

    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /clear all 2/i }));

    const s = usePlayerStore.getState();
    expect(s.mode).toBe('drill');
    expect(s.active).toBe(true);
    expect(new Set(s.queue.map((c) => c.conceptId))).toEqual(new Set([a, b]));
  });

  it('Fix now starts rehab for exactly that concept', async () => {
    const [a, b] = twoConcepts();
    const yesterday = addDaysLocal(todayLocal(), -1);
    upsertMiss(db, a, 'wrong', yesterday);
    upsertMiss(db, b, 'wrong', yesterday);

    renderScreen();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Fix now' }))[0]!);

    const s = usePlayerStore.getState();
    expect(s.mode).toBe('rehab');
    expect(s.active).toBe(true);
    expect(s.queue.every((c) => c.conceptId === a || c.conceptId === b)).toBe(true);
    expect(new Set(s.queue.map((c) => c.conceptId)).size).toBe(1);
  });

  it('snooze marks the item snoozed 3 days out', async () => {
    const [a] = twoConcepts();
    const yesterday = addDaysLocal(todayLocal(), -1);
    upsertMiss(db, a, 'wrong', yesterday);

    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Snooze 3 days' }));

    const item = getAllReviewItems(db).find((r) => r.concept_id === a)!;
    expect(item.status).toBe('snoozed');
    expect(item.due_at).toBe(addDaysLocal(todayLocal(), 3));
  });

  it('an expired snooze is back in the list', async () => {
    const [a] = twoConcepts();
    const fourDaysAgo = addDaysLocal(todayLocal(), -4);
    upsertMiss(db, a, 'wrong', addDaysLocal(fourDaysAgo, -1));
    snoozeItem(db, a, fourDaysAgo);

    renderScreen();
    expect(await screen.findByText(conceptLabel(a))).toBeTruthy();
    expect(screen.getByRole('button', { name: /clear all 1/i })).toBeTruthy();
  });

  it('renders the empty state when nothing is due', async () => {
    renderScreen();
    expect(await screen.findByText(/all caught up/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /clear all/i })).toBeNull();
  });
});

describe('concept labels', () => {
  it('conceptLabel resolves every content concept to a human title, never the raw id', () => {
    const mission = getMission('r1-m1');
    for (const step of mission!.steps) {
      if (step.type === 'checkpoint') continue;
      const label = conceptLabel(step.conceptId);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(step.conceptId);
    }
  });
});
