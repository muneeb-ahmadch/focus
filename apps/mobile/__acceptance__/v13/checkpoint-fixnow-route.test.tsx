// @vitest-environment jsdom
// Pins v11-smoke V11-D1 (carried): CheckpointFailed → "Fix these now" must land
// the learner in a drill over the missed concepts, not a dead blank screen.
//
// Root cause was a pre-existing v5×v7 interaction, invisible to store-only tests:
// onFixNow seeded a drill in the store but never navigated, so the player route
// kept its mission URL params. The v7 hijack guard then saw an active session
// whose mode no longer matched the mission param, abandoned the just-seeded
// drill, and fell into the started=true blank branch. v5's checkpoint-failed
// test only asserted store state after the click — it rendered PlayerScreen, not
// PlayerRoute, so the blank never showed. This pin renders PlayerRoute and
// simulates the navigation, so the route-level reconciliation is exercised.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import PlayerRoute from '../../app/player';
import { getMission, getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { createProfile } from '@/db/repo/profile';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { useSettingsStore } from '@/stores/settingsStore';
import { usePlayerStore } from '@/stores/playerStore';
import { playUntil, type PlayPlan } from '../v2/driver';

const h = vi.hoisted(() => ({
  db: null as unknown,
  params: {} as Record<string, string>,
}));

function paramsFromPath(path: string): Record<string, string> {
  const q = path.split('?')[1];
  if (!q) return {};
  return Object.fromEntries(new URLSearchParams(q));
}

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: {
    replace: (path: string) => {
      h.params = paramsFromPath(path);
    },
    back: () => {},
    push: () => {},
  },
  useLocalSearchParams: () => h.params,
}));
vi.mock('@/notifications/scheduler', () => ({
  rescheduleAll: async () => {},
  requestPermissionOnce: async () => {},
}));
vi.mock('@/lib/speech', () => ({
  speak: () => {},
  stopSpeech: () => {},
  initNarrationVoice: async () => {},
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/MasteryBar', () => ({ MasteryBar: () => null }));

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  syncRoutesFromContent(db, getRouteManifest());
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
  h.db = db;
  h.params = {};
  useSettingsStore.getState().hydrate();
  usePlayerStore.getState().abandon();
});

afterEach(cleanup);

describe('CheckpointFailed → Fix these now (V11-D1 route-level)', () => {
  it('lands on a drill over the missed concepts, not a blank/abandoned dead end', () => {
    const mission = getMission('r1-m1')!;
    const checkpoint = mission.steps.find((s) => s.type === 'checkpoint');
    if (!checkpoint || checkpoint.type !== 'checkpoint') throw new Error('no checkpoint');
    const missed = new Set(checkpoint.questions.slice(0, 2).map((q) => q.conceptId));

    const plan: PlayPlan = {
      correct: (card) => !(card.kind === 'checkpoint-q' && missed.has(card.conceptId)),
    };
    usePlayerStore.getState().startMission('r1-m1');
    playUntil(usePlayerStore, plan, (s) => s.phase === 'failed');

    // Enter the player under the mission URL — exactly how the learner reached the
    // failed screen (mission in progress, then checkpoint fail).
    h.params = { mode: 'mission', missionId: 'r1-m1' };
    render(<PlayerRoute />);
    expect(screen.getByRole('button', { name: 'Fix these now' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Fix these now' }));

    // The drill must actually render (route-level assertion — this is what the
    // store-only v5 pin could not see). 'Review' is the drill-q card heading.
    expect(screen.getByText('Review')).toBeTruthy();
    expect(screen.queryByText('Start mission')).toBeNull();

    const store = usePlayerStore.getState();
    expect(store.mode).toBe('drill');
    expect(store.active).toBe(true);
    expect(new Set(store.queue.map((c) => c.conceptId))).toEqual(missed);

    // The seeded drill must survive — the bug abandoned it via the hijack guard.
    const abandonedDrill = db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM attempt WHERE attempt_type = 'drill' AND status = 'abandoned'`,
    );
    expect(abandonedDrill?.n).toBe(0);
  });
});
