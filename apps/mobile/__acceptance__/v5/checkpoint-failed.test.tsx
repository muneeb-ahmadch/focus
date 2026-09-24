// @vitest-environment jsdom
// Slice v5 gate: CheckpointFailed must teach, not just dismiss. The failed
// screen offers "Fix these now" which seeds a drill from exactly the missed
// concepts, alongside the way back home.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { checkpointConceptId, getMission, getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { createProfile } from '@/db/repo/profile';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { PlayerScreen } from '@/components/player/PlayerScreen';
import { useSettingsStore } from '@/stores/settingsStore';
import { usePlayerStore } from '@/stores/playerStore';
import { playUntil, type PlayPlan } from '../v2/driver';

const h = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: () => {}, back: () => {}, push: () => {} },
}));
vi.mock('@/notifications/scheduler', () => ({ rescheduleAll: async () => {} }));
vi.mock('@/lib/speech', () => ({
  speak: () => {},
  stopSpeech: () => {},
  initNarrationVoice: async () => {},
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  syncRoutesFromContent(db, getRouteManifest());
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
  h.db = db;
  useSettingsStore.getState().hydrate();
  usePlayerStore.getState().abandon();
});

afterEach(cleanup);

describe('CheckpointFailed screen', () => {
  it('offers Fix these now → drill over exactly the missed concepts', () => {
    const mission = getMission('r1-m1')!;
    const checkpoint = mission.steps.find((s) => s.type === 'checkpoint');
    if (!checkpoint || checkpoint.type !== 'checkpoint') throw new Error('no checkpoint');
    const missed = new Set(checkpoint.questions.slice(0, 2).map(checkpointConceptId));

    const plan: PlayPlan = {
      correct: (card) => !(card.kind === 'checkpoint-q' && missed.has(card.conceptId)),
    };
    usePlayerStore.getState().startMission('r1-m1');
    playUntil(usePlayerStore, plan, (s) => s.phase === 'failed');

    render(<PlayerScreen />);
    expect(screen.getByRole('button', { name: 'Back to Home' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Fix these now' }));
    const s = usePlayerStore.getState();
    expect(s.mode).toBe('drill');
    expect(s.active).toBe(true);
    expect(new Set(s.queue.map((c) => c.conceptId))).toEqual(missed);
  });
});
