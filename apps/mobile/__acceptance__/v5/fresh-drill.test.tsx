// @vitest-environment jsdom
// Slice v5 gate: Fresh Drill after MissionComplete. A mission that produced
// misses hands its missed concepts to the completion screen, whose leading
// CTA launches a drill seeded from exactly those concepts. A clean mission
// keeps the plain Continue.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import MissionCompleteRoute from '../../app/mission-complete';
import { getMission, getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { getMissionState } from '@/db/repo/missions';
import { createProfile } from '@/db/repo/profile';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { usePlayerStore } from '@/stores/playerStore';
import { parseResumePayload } from '@/stores/resumePayload';
import { playToEnd, playUntil, allCorrect, type PlayPlan } from '../v2/driver';

const h = vi.hoisted(() => ({
  db: null as unknown,
  replace: vi.fn(),
  params: {} as Record<string, string>,
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: h.replace, back: () => {}, push: () => {} },
  useLocalSearchParams: () => h.params,
}));
vi.mock('@/notifications/scheduler', () => ({
  rescheduleAll: async () => {},
  requestPermissionOnce: async () => {},
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
  h.replace.mockClear();
  h.params = {};
  usePlayerStore.getState().abandon();
});

afterEach(cleanup);

function teachingConcepts(missionId: string): string[] {
  return [
    ...new Set(
      getMission(missionId)!
        .steps.filter((s) => s.type !== 'checkpoint')
        .map((s) => s.conceptId),
    ),
  ];
}

describe('mission completion hands missed concepts to the completion screen', () => {
  it('finishMission routes to mission-complete with the missed concepts in params', () => {
    const missTargets = new Set(teachingConcepts('r1-m1').slice(0, 2));
    const plan: PlayPlan = {
      correct: (card) => !(card.kind === 'step' && missTargets.has(card.conceptId)),
    };

    usePlayerStore.getState().startMission('r1-m1');
    playToEnd(usePlayerStore, plan);

    expect(h.replace).toHaveBeenCalled();
    const call = h.replace.mock.calls[0]![0] as {
      pathname: string;
      params: Record<string, string>;
    };
    expect(call.pathname).toBe('/mission-complete');
    expect(Number(call.params.newReviews)).toBe(missTargets.size);
    const missed = String(call.params.missed ?? '').split(',').filter(Boolean).sort();
    expect(missed).toEqual([...missTargets].sort());
  });

  it('kill + resume preserves the missed concepts accumulated before the kill (QA v5 finding 1)', () => {
    const target = teachingConcepts('r1-m1')[0]!;
    const missOnce: PlayPlan = {
      correct: (card) =>
        !(
          card.kind === 'step' &&
          card.conceptId === target &&
          !usePlayerStore.getState().missedConcepts.includes(target)
        ),
    };

    const store = usePlayerStore;
    store.getState().startMission('r1-m1');
    playUntil(
      store,
      missOnce,
      (s) => s.phase === 'card' && store.getState().missedConcepts.includes(target),
    );

    const row = getMissionState(db, 'r1-m1');
    const payload = parseResumePayload(row?.resume_payload_json ?? null);
    expect(payload, 'resume payload must exist and parse mid-mission').toBeDefined();

    store.setState({ active: false });
    store.getState().startMission('r1-m1', payload);
    playToEnd(store, allCorrect);

    expect(h.replace).toHaveBeenCalled();
    const call = h.replace.mock.calls.at(-1)![0] as {
      pathname: string;
      params: Record<string, string>;
    };
    expect(call.pathname).toBe('/mission-complete');
    expect(Number(call.params.newReviews), 'the pre-kill miss must survive the resume').toBe(1);
    expect(String(call.params.missed).split(',')).toContain(target);
  });
});

describe('mission-complete fresh drill CTA', () => {
  it('with misses: "Fix them now" leads and seeds a drill with exactly the missed concepts', () => {
    const [a, b] = teachingConcepts('r1-m1');
    h.params = {
      missionId: 'r1-m1',
      score: '1',
      streak: '1',
      milestone: '',
      masteryBefore: '0',
      masteryAfter: '0.4',
      newReviews: '2',
      missed: `${a},${b}`,
    };

    render(<MissionCompleteRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Fix them now' }));

    const s = usePlayerStore.getState();
    expect(s.mode).toBe('drill');
    expect(s.active).toBe(true);
    expect(new Set(s.queue.map((c) => c.conceptId))).toEqual(new Set([a, b]));
  });

  it('with misses there is still a way to skip the drill', () => {
    const [a] = teachingConcepts('r1-m1');
    h.params = {
      missionId: 'r1-m1',
      score: '1',
      streak: '1',
      milestone: '',
      masteryBefore: '0',
      masteryAfter: '0.4',
      newReviews: '1',
      missed: a!,
    };

    render(<MissionCompleteRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(usePlayerStore.getState().active).toBe(false);
  });

  it('with no misses: plain Continue, no drill CTA', () => {
    h.params = {
      missionId: 'r1-m1',
      score: '1',
      streak: '1',
      milestone: '',
      masteryBefore: '0',
      masteryAfter: '0.4',
      newReviews: '0',
      missed: '',
    };

    render(<MissionCompleteRoute />);
    expect(screen.queryByRole('button', { name: 'Fix them now' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });
});
