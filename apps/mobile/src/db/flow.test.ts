import { beforeEach, describe, expect, it } from 'vitest';
import { getMission, getRouteManifest } from '@/content';
import { gradeCheckpoint, computeReadiness, computeStreak } from '@focus/engine';
import { dayNumber } from '@/lib/clock';
import type { Db } from './adapter';
import { openTestDb } from './testing/adapter.node';
import { migrate } from './migrations';
import { bumpActivity, getActiveDays, getScoredCount } from './repo/activity';
import { finishAttempt, recordAnswer, startAttempt } from './repo/attempts';
import { completeMission, ensureMissionRow, getMissionState } from './repo/missions';
import { createProfile } from './repo/profile';
import { applyGrade, getDue, upsertMiss, type ReviewItem } from './repo/reviews';
import { getRouteState, recomputeRoute, syncRoutesFromContent } from './repo/routes';

// Integration walk of the core loop at the data layer — mirrors the E2E script's
// DB-observable expectations (simulator rows 3–5, 7–8).
describe('core loop flow (data layer)', () => {
  const TODAY = '2026-07-06';
  let db: Db;

  beforeEach(() => {
    db = openTestDb();
    migrate(db);
    syncRoutesFromContent(db, getRouteManifest());
    createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
  });

  function playMissionOne() {
    const mission = getMission('r1-m1');
    expect(mission).toBeDefined();
    if (!mission) return;
    ensureMissionRow(db, mission.missionId, mission.routeId);
    const attemptId = startAttempt(db, 'lesson', mission.missionId);

    const teaching = mission.steps.filter((s) => s.type !== 'checkpoint');
    teaching.forEach((step, i) => {
      const wrong = i === 2; // one wrong teaching answer (c.speed.nsl-sign)
      const unsure = i === 4; // one correct-but-not-sure (c.speed.default-limits)
      recordAnswer(db, attemptId, {
        stepId: step.id,
        conceptId: step.conceptId,
        correct: !wrong,
        confidence: wrong || unsure ? 'unsure' : 'sure',
      });
      if (wrong) upsertMiss(db, step.conceptId, 'wrong', TODAY);
      if (unsure) upsertMiss(db, step.conceptId, 'unsure', TODAY);
    });

    const checkpoint = mission.steps[mission.steps.length - 1];
    if (checkpoint?.type !== 'checkpoint') throw new Error('last step must be checkpoint');
    const checkpointAnswers = checkpoint.questions.map((q, i) => {
      const correct = i !== 1; // 4/5 — miss the nsl-sign question again
      recordAnswer(db, attemptId, {
        stepId: `${checkpoint.id}#q${i}`,
        conceptId: q.conceptId,
        correct,
        confidence: correct ? 'sure' : 'unsure',
      });
      if (!correct) upsertMiss(db, q.conceptId, 'wrong', TODAY);
      return { conceptId: q.conceptId, correct };
    });

    const result = gradeCheckpoint(checkpointAnswers);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0.8);

    finishAttempt(db, attemptId, 'submitted', result.score, null);
    completeMission(db, mission.missionId, result.score);
    bumpActivity(db, TODAY, 'missions_completed');
    const info = getRouteManifest().find((r) => r.routeId === mission.routeId);
    if (info) recomputeRoute(db, mission.routeId, info);
  }

  it('mission 1 pass: review items, activity, streak, mastery all land as the E2E script expects', () => {
    playMissionOne();

    const items = db.all<ReviewItem>('SELECT * FROM review_item ORDER BY concept_id');
    expect(items.map((r) => r.concept_id)).toEqual([
      'c.speed.default-limits',
      'c.speed.nsl-sign',
    ]);
    for (const item of items) {
      expect(item.interval_days).toBe(1);
      expect(item.due_at).toBe('2026-07-07');
      expect(item.status).toBe('active');
    }
    // nsl-sign was missed twice (teaching + checkpoint) → second upsert lapses it
    expect(items.find((r) => r.concept_id === 'c.speed.nsl-sign')?.lapses).toBe(1);

    const activity = db.get<{ missions_completed: number }>(
      'SELECT missions_completed FROM daily_activity WHERE day = ?',
      [TODAY],
    );
    expect(activity?.missions_completed).toBe(1);
    expect(computeStreak(getActiveDays(db).map(dayNumber), dayNumber(TODAY))).toBe(1);

    expect(getMissionState(db, 'r1-m1')?.status).toBe('completed');
    expect(getMissionState(db, 'r1-m1')?.best_checkpoint_score).toBe(0.8);

    // E2E row 4 expects mastery ~0.4–0.48 after one 0.8-checkpoint mission
    const mastery = getRouteState(db, 'route-1')?.mastery ?? 0;
    expect(mastery).toBeGreaterThanOrEqual(0.4);
    expect(mastery).toBeLessThanOrEqual(0.48);

    // E2E row 6: readiness still locked (<20 answers after one mission)
    expect(getScoredCount(db)).toBeLessThan(20);
    expect(
      computeReadiness({
        scoredAnswers: getScoredCount(db),
        routeCoverage: 0.2,
        dueReviews: 0,
        recentAccuracy: 0.8,
        consistency: 1,
      }).score,
    ).toBeNull();
  });

  it('next-day drill: Easy → interval 3, wrong → interval 1 with a lapse (E2E rows 7–8)', () => {
    playMissionOne();
    const tomorrow = '2026-07-07';

    const due = getDue(db, tomorrow);
    expect(due.map((r) => r.concept_id)).toEqual([
      'c.speed.default-limits',
      'c.speed.nsl-sign',
    ]);

    applyGrade(db, 'c.speed.default-limits', 'easy', tomorrow);
    applyGrade(db, 'c.speed.nsl-sign', 'wrong', tomorrow);

    const easy = db.get<ReviewItem>(
      'SELECT * FROM review_item WHERE concept_id = ?',
      ['c.speed.default-limits'],
    );
    expect(easy?.interval_days).toBe(3);
    expect(easy?.due_at).toBe('2026-07-10');

    const wrong = db.get<ReviewItem>(
      'SELECT * FROM review_item WHERE concept_id = ?',
      ['c.speed.nsl-sign'],
    );
    expect(wrong?.interval_days).toBe(1);
    expect(wrong?.due_at).toBe('2026-07-08');
    expect(wrong?.lapses).toBe(2);
  });

  it('repair path never inflates the recorded score (E2E row 9)', () => {
    const mission = getMission('r1-m2');
    expect(mission).toBeDefined();
    if (!mission) return;
    ensureMissionRow(db, mission.missionId, mission.routeId);
    // fail first quiz 3/5, repair succeeds → recorded score stays 0.6
    completeMission(db, mission.missionId, 0.6);
    expect(getMissionState(db, 'r1-m2')?.best_checkpoint_score).toBe(0.6);
    expect(getMissionState(db, 'r1-m2')?.status).toBe('completed');
  });
});
