// @vitest-environment jsdom
// Pins v6-smoke DEFECT 1: a session left active in the store (rehab/drill/mission
// abandoned without the exit confirm) must not hijack a later player mount that
// requests a specific mission. The player route reconciles the active session
// against its params: a mismatch abandons the dangling session (mission resume
// persisted, attempt marked abandoned) and shows the requested mission's intro.
// A param-less mount (review-queue / mission-complete store-launched path) still
// trusts the store.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import PlayerRoute from '../../app/player';
import { getMission, getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { getMissionState } from '@/db/repo/missions';
import { createProfile } from '@/db/repo/profile';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { usePlayerStore } from '@/stores/playerStore';

const h = vi.hoisted(() => ({
  db: null as unknown,
  params: {} as Record<string, string>,
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: () => {}, back: () => {}, push: () => {} },
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
  usePlayerStore.getState().abandon();
});

afterEach(cleanup);

function teachingConcept(missionId: string): string {
  return getMission(missionId)!.steps.filter((s) => s.type !== 'checkpoint')[0]!.conceptId;
}

describe('dangling session vs requested mission (v6-smoke defect 1)', () => {
  it('a dangling rehab session does not hijack a mission entry: intro renders, rehab attempt abandoned', () => {
    usePlayerStore.getState().startRehab(teachingConcept('r1-m1'));
    expect(usePlayerStore.getState().active).toBe(true);

    h.params = { missionId: 'r1-m3' };
    render(<PlayerRoute />);

    screen.getByText(getMission('r1-m3')!.title);
    screen.getByText('Start mission');
    expect(usePlayerStore.getState().active).toBe(false);
    const attempt = db.get<{ status: string }>(
      `SELECT status FROM attempt WHERE attempt_type != 'lesson' ORDER BY attempt_id DESC LIMIT 1`,
    );
    expect(attempt?.status).toBe('abandoned');
  });

  it('a dangling mission session yields to a different requested mission and keeps its resume', () => {
    usePlayerStore.getState().startMission('r1-m1');

    h.params = { missionId: 'r1-m2' };
    render(<PlayerRoute />);

    screen.getByText(getMission('r1-m2')!.title);
    const m1 = getMissionState(db, 'r1-m1');
    expect(m1?.status).toBe('in_progress');
    expect(m1?.resume_payload_json).toBeTruthy();
  });

  it('a mount requesting the mission that IS the active session keeps the live session (no reset)', () => {
    usePlayerStore.getState().startMission('r1-m1');
    const indexBefore = usePlayerStore.getState().index;

    h.params = { missionId: 'r1-m1' };
    render(<PlayerRoute />);

    expect(usePlayerStore.getState().active).toBe(true);
    expect(usePlayerStore.getState().index).toBe(indexBefore);
  });

  it('a param-less mount still renders the store-launched session (review-queue path)', () => {
    usePlayerStore.getState().startRehab(teachingConcept('r1-m1'));

    h.params = {};
    render(<PlayerRoute />);

    expect(usePlayerStore.getState().active).toBe(true);
    expect(screen.queryByText('Start mission')).toBeNull();
  });
});
