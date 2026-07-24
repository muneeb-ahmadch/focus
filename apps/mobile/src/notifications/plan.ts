import { z } from 'zod';
import { buildDailyPlan, computeStreak, PLAN_FINAL_DAYS, type PlanRoute } from '@focus/engine';
import type { Db } from '@/db/adapter';
import { getActiveDays } from '@/db/repo/activity';
import { getResumableMission } from '@/db/repo/missions';
import { getProfile } from '@/db/repo/profile';
import { countActiveDueOnOrBefore } from '@/db/repo/reviews';
import { getAllRouteStates } from '@/db/repo/routes';
import { addDaysLocal, dayNumber, diffDaysLocal, localDayToDate } from '@/lib/clock';
import { MOCKS_ENABLED } from '@/flags';

export interface PlannedNotification {
  day: string;
  body: string;
}

const studyDaysSchema = z.array(z.number());

function parseStudyDays(json: string): number[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [1, 2, 3, 4, 5, 6, 7];
  }
  const result = studyDaysSchema.safeParse(parsed);
  return result.success ? result.data : [1, 2, 3, 4, 5, 6, 7];
}

function isoWeekday(day: string): number {
  const jsDay = localDayToDate(day).getDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function planNotifications(db: Db, today: string): PlannedNotification[] {
  const profile = getProfile(db);
  if (!profile) return [];

  const studyDays = parseStudyDays(profile.study_days_json);
  const routes: PlanRoute[] = getAllRouteStates(db).map((r) => ({
    routeId: r.route_id,
    mastery: r.mastery,
    completedMissions: r.completed_missions,
    totalMissions: r.total_missions,
  }));
  const hasResume = getResumableMission(db) !== undefined;
  const streak = computeStreak(getActiveDays(db).map(dayNumber), dayNumber(today));

  const notifications: PlannedNotification[] = [];

  for (let i = 0; i < 7; i++) {
    const day = addDaysLocal(today, i);
    const d = diffDaysLocal(day, profile.test_date);
    if (d < 0) break;
    if (!studyDays.includes(isoWeekday(day))) continue;

    const due = countActiveDueOnOrBefore(db, day);
    const plan = buildDailyPlan({
      hasResume,
      dueReviews: due,
      routes,
      daysToTest: d,
      mocksAvailable: MOCKS_ENABLED,
      // the interleaved quick-drill is a warm-up, never a notification nudge —
      // notification copy is driven by missions/reviews/mocks/streak only.
      quickDrillAvailable: false,
    });
    if (plan.length === 0) continue;

    let body: string;
    if (d < PLAN_FINAL_DAYS && plan.some((p) => p.kind === 'mock')) {
      body =
        d <= 0
          ? "It's test day — a quick review this morning, then trust your prep."
          : d === 1
            ? 'Test tomorrow — one mock and your reviews.'
            : 'Test in 2 days — mocks and reviews only from here.';
    } else if (plan[0]!.kind === 'reviews') {
      body = `You have ${due} reviews due — clear them before they pile up.`;
    } else if (plan[0]!.kind === 'mock') {
      body = `Test in ${d} days — sit a mock while it counts.`;
    } else {
      body =
        streak >= 3 && i <= 1
          ? `Don't lose your ${streak}-day streak — today's mission takes ~6 minutes.`
          : `Test in ${d} days — today's mission takes ~6 minutes.`;
    }

    notifications.push({ day, body });
  }

  return notifications;
}
