export type PlanItemKind = 'resume' | 'reviews' | 'mission' | 'mock';
export interface PlanItem { kind: PlanItemKind; routeId?: string }
export interface PlanRoute {
  routeId: string;
  mastery: number;
  completedMissions: number;
  totalMissions: number;
}
export interface PlanInputs {
  hasResume: boolean;
  dueReviews: number;
  routes: PlanRoute[];
  daysToTest: number;
  mocksAvailable: boolean;
}

export const PLAN_REVIEW_URGENT = 10;
export const PLAN_MOCK_WINDOW_DAYS = 14;
export const PLAN_FINAL_DAYS = 3;

const pickMissionRoute = (routes: PlanRoute[]): PlanRoute | undefined => {
  const eligible = routes.filter((r) => r.totalMissions > 0 && r.completedMissions < r.totalMissions);
  return eligible.reduce<PlanRoute | undefined>((weakest, route) => {
    if (!weakest) return route;
    if (route.mastery < weakest.mastery) return route;
    if (route.mastery === weakest.mastery && route.routeId < weakest.routeId) return route;
    return weakest;
  }, undefined);
};

export function buildDailyPlan(i: PlanInputs): PlanItem[] {
  const plan: PlanItem[] = [];

  if (i.hasResume) plan.push({ kind: 'resume' });

  if (i.daysToTest < PLAN_FINAL_DAYS) {
    if (i.dueReviews > 0) plan.push({ kind: 'reviews' });
    if (i.mocksAvailable) plan.push({ kind: 'mock' });
    return plan;
  }

  if (i.dueReviews > PLAN_REVIEW_URGENT) plan.push({ kind: 'reviews' });

  const missionRoute = pickMissionRoute(i.routes);
  if (missionRoute) plan.push({ kind: 'mission', routeId: missionRoute.routeId });

  if (i.dueReviews >= 1 && i.dueReviews <= PLAN_REVIEW_URGENT) plan.push({ kind: 'reviews' });

  if (i.daysToTest < PLAN_MOCK_WINDOW_DAYS && i.mocksAvailable) plan.push({ kind: 'mock' });

  return plan;
}
