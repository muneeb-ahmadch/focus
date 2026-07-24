import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkpointConceptId, getMission, getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { getActivity } from '@/db/repo/activity';
import { getMissionState } from '@/db/repo/missions';
import { createProfile } from '@/db/repo/profile';
import { getAllReviewItems } from '@/db/repo/reviews';
import { getRouteState, syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { usePlayerStore } from '@/stores/playerStore';
import { playToEnd, playUntil, type PlayPlan } from './driver';

const h = vi.hoisted(() => ({
  db: null as unknown,
  today: '2026-07-06',
  replaceCalls: [] as { pathname?: string; params?: Record<string, string> }[],
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: {
    replace: (arg: { pathname?: string; params?: Record<string, string> }) => {
      h.replaceCalls.push(arg);
    },
    back: () => {},
    push: () => {},
  },
}));
vi.mock('@/notifications/scheduler', () => ({ rescheduleAll: async () => {} }));
vi.mock('@/lib/clock', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/clock')>();
  return {
    ...real,
    todayLocal: () => h.today,
    now: () => real.localDayToDate(h.today),
  };
});

let db: Db;

function checkpointConceptsOf(missionId: string): Set<string> {
  const mission = getMission(missionId);
  if (!mission) throw new Error(`missing mission ${missionId}`);
  const step = mission.steps.find((s) => s.type === 'checkpoint');
  if (step?.type !== 'checkpoint') throw new Error('mission has no checkpoint');
  return new Set(step.questions.map(checkpointConceptId));
}

// Plays r1-m1 with one correct-but-unsure teaching answer and exactly one wrong
// checkpoint answer (distinct concepts, both drillable via checkpoint questions).
function playCleanishMission(): { unsureConcept: string; wrongConcept: string } {
  const drillable = checkpointConceptsOf('r1-m1');
  let unsureConcept: string | undefined;
  let wrongConcept: string | undefined;
  const plan: PlayPlan = {
    correct(card) {
      if (
        card.kind === 'checkpoint-q' &&
        wrongConcept === undefined &&
        card.conceptId !== unsureConcept
      ) {
        wrongConcept = card.conceptId;
        return false;
      }
      return true;
    },
    confidence(card) {
      if (card.kind === 'step' && unsureConcept === undefined && drillable.has(card.conceptId)) {
        unsureConcept = card.conceptId;
        return 'unsure';
      }
      return 'sure';
    },
  };
  usePlayerStore.getState().startMission('r1-m1');
  const queueLength = usePlayerStore.getState().queue.length;
  expect(queueLength).toBeGreaterThan(0);
  playToEnd(usePlayerStore, plan);
  if (!unsureConcept || !wrongConcept) throw new Error('plan never picked its concepts');
  expect(unsureConcept).not.toBe(wrongConcept);
  return { unsureConcept, wrongConcept };
}

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  syncRoutesFromContent(db, getRouteManifest());
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
  h.db = db;
  h.today = '2026-07-06';
  h.replaceCalls = [];
  usePlayerStore.getState().abandon();
});

describe('full loop through the store (no test-side row seeding — production parity)', () => {
  it('mission completes and persists: status, score, reviews, activity, mastery, navigation', () => {
    const { unsureConcept, wrongConcept } = playCleanishMission();

    expect(usePlayerStore.getState().active).toBe(false);

    const state = getMissionState(db, 'r1-m1');
    expect(state?.status).toBe('completed');
    expect(state?.best_checkpoint_score).toBe(0.8);
    expect(state?.resume_payload_json).toBeNull();

    const items = getAllReviewItems(db);
    expect(new Set(items.map((i) => i.concept_id))).toEqual(
      new Set([unsureConcept, wrongConcept]),
    );
    for (const item of items) {
      expect(item.status).toBe('active');
      expect(item.interval_days).toBe(1);
      expect(item.due_at).toBe('2026-07-07');
      expect(item.lapses).toBe(0);
    }
    expect(items.find((i) => i.concept_id === wrongConcept)?.origin_type).toBe('wrong');
    expect(items.find((i) => i.concept_id === unsureConcept)?.origin_type).toBe('unsure');

    expect(getActivity(db).find((d) => d.day === '2026-07-06')?.missions_completed).toBe(1);

    const mastery = getRouteState(db, 'route-1')?.mastery ?? 0;
    expect(mastery).toBeGreaterThanOrEqual(0.4);
    expect(mastery).toBeLessThanOrEqual(0.48);

    const nav = h.replaceCalls.at(-1);
    expect(nav?.pathname).toBe('/mission-complete');
    expect(nav?.params?.streak).toBe('1');
    expect(nav?.params?.newReviews).toBe('2');

    const attempt = db.get<{ status: string; score: number }>(
      `SELECT status, score FROM attempt WHERE attempt_type = 'lesson'`,
    );
    expect(attempt).toEqual({ status: 'submitted', score: 0.8 });
  });

  it('checkpoint fail → repair covers exactly the missed material → completes with the ORIGINAL score', () => {
    const wrongs: string[] = [];
    const wrongStepIds: string[] = [];
    const failTwoPlan: PlayPlan = {
      correct(card, s) {
        if (
          !s.inRepair &&
          card.kind === 'checkpoint-q' &&
          wrongs.length < 2 &&
          !wrongs.includes(card.conceptId)
        ) {
          wrongs.push(card.conceptId);
          wrongStepIds.push(card.stepId);
          return false;
        }
        return true;
      },
    };

    usePlayerStore.getState().startMission('r1-m1');
    playUntil(usePlayerStore, failTwoPlan, (s) => s.phase === 'repair-intro');
    expect(wrongs).toHaveLength(2);

    const s = usePlayerStore.getState();
    expect(s.inRepair).toBe(true);
    expect(s.originalCheckpointScore).toBe(0.6);

    const mission = getMission('r1-m1');
    if (!mission) throw new Error('missing r1-m1');
    const expectedTeachIds = mission.steps
      .filter((st) => st.type !== 'checkpoint' && wrongs.includes(st.conceptId))
      .map((st) => st.id);
    expect(s.queue.map((c) => c.stepId)).toEqual([...expectedTeachIds, ...wrongStepIds]);

    playToEnd(usePlayerStore, failTwoPlan);

    const state = getMissionState(db, 'r1-m1');
    expect(state?.status).toBe('completed');
    expect(state?.best_checkpoint_score).toBe(0.6);
  });

  it('failing the repair requiz fails the mission with the original score', () => {
    const wrongs: string[] = [];
    const plan: PlayPlan = {
      correct(card, s) {
        if (s.inRepair) return card.kind !== 'checkpoint-q';
        if (
          card.kind === 'checkpoint-q' &&
          wrongs.length < 2 &&
          !wrongs.includes(card.conceptId)
        ) {
          wrongs.push(card.conceptId);
          return false;
        }
        return true;
      },
    };

    usePlayerStore.getState().startMission('r1-m1');
    playToEnd(usePlayerStore, plan);

    expect(usePlayerStore.getState().phase).toBe('failed');
    const state = getMissionState(db, 'r1-m1');
    expect(state?.status).toBe('failed_checkpoint');
    expect(state?.best_checkpoint_score).toBe(0.6);
    expect(state?.resume_payload_json).toBeNull();

    const requizzed = getAllReviewItems(db).find((i) => i.concept_id === wrongs[0]);
    expect(requizzed?.lapses).toBe(1);
  });

  it('next-day drill applies SRS: wrong resets with a lapse, easy walks the ladder', () => {
    const { unsureConcept, wrongConcept } = playCleanishMission();

    h.today = '2026-07-07';
    usePlayerStore.getState().startDrill();
    expect(usePlayerStore.getState().queue).toHaveLength(2);

    const drillPlan: PlayPlan = {
      correct: (card) => card.conceptId !== wrongConcept,
      confidence: () => 'easy',
    };
    playToEnd(usePlayerStore, drillPlan);

    expect(usePlayerStore.getState().phase).toBe('drill-summary');
    expect(usePlayerStore.getState().drillCorrect).toBe(1);

    const items = getAllReviewItems(db);
    const missed = items.find((i) => i.concept_id === wrongConcept);
    expect(missed?.interval_days).toBe(1);
    expect(missed?.lapses).toBe(1);
    expect(missed?.due_at).toBe('2026-07-08');
    expect(missed?.status).toBe('active');

    const eased = items.find((i) => i.concept_id === unsureConcept);
    expect(eased?.interval_days).toBe(3);
    expect(eased?.due_at).toBe('2026-07-10');
    expect(eased?.status).toBe('active');

    expect(getActivity(db).find((d) => d.day === '2026-07-07')?.reviews_cleared).toBe(2);

    const attempt = db.get<{ status: string; score: number }>(
      `SELECT status, score FROM attempt WHERE attempt_type = 'drill'`,
    );
    expect(attempt).toEqual({ status: 'submitted', score: 0.5 });
  });
});
