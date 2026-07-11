import type { Db } from '@/db/adapter';
import { getActiveDays, getRecentAccuracy, getScoredCount, getTotalXp } from '@/db/repo/activity';
import { getProfile, type UserProfile } from '@/db/repo/profile';
import { getDue } from '@/db/repo/reviews';
import { getAllRouteStates } from '@/db/repo/routes';
import { computeReadiness, computeStreak, type Readiness, type ReadinessInputs } from '@focus/engine';
import { addDaysLocal, dayNumber, diffDaysLocal, todayLocal } from '@/lib/clock';

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
}

export function buildStats(db: Db): AppStats {
  const today = todayLocal();
  const profile = getProfile(db);
  const activeDays = getActiveDays(db);
  const scoredAnswers = getScoredCount(db);
  const dueCount = getDue(db, today).length;

  const routes = getAllRouteStates(db).filter((r) => r.total_missions > 0);
  const totalMissions = routes.reduce((a, r) => a + r.total_missions, 0);
  const completedMissions = routes.reduce((a, r) => a + r.completed_missions, 0);

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
    scoredAnswers,
    routeCoverage: totalMissions === 0 ? 0 : completedMissions / totalMissions,
    dueReviews: dueCount,
    recentAccuracy: getRecentAccuracy(db),
    consistency,
  };

  return {
    today,
    profile,
    scoredAnswers,
    dueCount,
    streak: computeStreak(activeDays.map(dayNumber), dayNumber(today)),
    xpTotal: getTotalXp(db),
    inputs,
    readiness: computeReadiness(inputs),
    daysToTest: profile ? diffDaysLocal(today, profile.test_date) : null,
    activeDotsLast14,
  };
}
