import type { Db } from '@/db/adapter';
import { getActiveDays, getRecentAccuracy, getScoredCount, getTotalXp } from '@/db/repo/activity';
import { getMockScores } from '@/db/repo/attempts';
import { getResumableMission } from '@/db/repo/missions';
import { getProfile, type UserProfile } from '@/db/repo/profile';
import { getDue } from '@/db/repo/reviews';
import { getAllRouteStates } from '@/db/repo/routes';
import {
  buildDailyPlan,
  computeReadiness,
  computeStreak,
  routeCoverageFromShares,
  type PlanItem,
  type Readiness,
  type ReadinessInputs,
} from '@focus/engine';
import { addDaysLocal, dayNumber, diffDaysLocal, todayLocal } from '@/lib/clock';
import { getRouteBankShares } from '@/lib/mockPool';
import { quickDrillAvailable } from '@/lib/quickDrill';
import { MOCKS_ENABLED } from '@/flags';

export interface AppStats {
  today: string;
  profile: UserProfile | undefined;
  scoredAnswers: number;
  dueCount: number;
  streak: number;
  xpTotal: number;
  inputs: ReadinessInputs;
  readiness: Readiness;
  daysToTest: number | null;
  activeDotsLast14: boolean[];
  plan: PlanItem[];
  resumeMissionId: string | null;
}

export function testDateLine(daysToTest: number): string {
  if (daysToTest < 0) return 'Your test date has passed — set a new one in Profile';
  if (daysToTest === 0) return 'Your test is today';
  if (daysToTest === 1) return 'Your test is tomorrow';
  return `Your test is in ${daysToTest} days`;
}

export function buildStats(db: Db): AppStats {
  const today = todayLocal();
  const profile = getProfile(db);
  const activeDays = getActiveDays(db);
  const scoredAnswers = getScoredCount(db);
  const dueCount = getDue(db, today).length;

  const routes = getAllRouteStates(db).filter((r) => r.total_missions > 0);
  const bankShares = getRouteBankShares();
  // §4 P1-4: coverage is yield-weighted by each route's bank share, so finishing a
  // bigger slice of the exam counts for more. The share distribution comes from the
  // bank (app layer); the engine only combines share × completion (stays pure).
  const routeCoverage = routeCoverageFromShares(
    routes.map((r) => ({
      bankShare: bankShares[r.route_id] ?? 0,
      completion: r.total_missions === 0 ? 0 : r.completed_missions / r.total_missions,
    })),
  );

  const last14 = new Set(activeDays);
  let activeLast14 = 0;
  const activeDotsLast14: boolean[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = addDaysLocal(today, -i);
    const active = last14.has(day);
    activeDotsLast14.push(active);
    if (active) activeLast14 += 1;
  }
  const daysSinceCreated = profile ? diffDaysLocal(profile.created_at, today) + 1 : 1;
  const consistency = activeLast14 / Math.max(1, Math.min(14, daysSinceCreated));

  const inputs: ReadinessInputs = {
    mockScores: getMockScores(db),
    scoredAnswers,
    routeCoverage,
    dueReviews: dueCount,
    recentAccuracy: getRecentAccuracy(db),
    consistency,
  };

  const daysToTest = profile ? diffDaysLocal(today, profile.test_date) : null;
  const resumable = getResumableMission(db);
  const plan = buildDailyPlan({
    hasResume: resumable !== undefined,
    dueReviews: dueCount,
    routes: routes.map((r) => ({
      routeId: r.route_id,
      mastery: r.mastery,
      completedMissions: r.completed_missions,
      totalMissions: r.total_missions,
    })),
    daysToTest: daysToTest ?? 999,
    mocksAvailable: MOCKS_ENABLED,
    quickDrillAvailable: quickDrillAvailable(db),
  });

  return {
    today,
    profile,
    scoredAnswers,
    dueCount,
    streak: computeStreak(activeDays.map(dayNumber), dayNumber(today)),
    xpTotal: getTotalXp(db),
    inputs,
    readiness: computeReadiness(inputs),
    daysToTest,
    activeDotsLast14,
    plan,
    resumeMissionId: resumable?.mission_id ?? null,
  };
}
