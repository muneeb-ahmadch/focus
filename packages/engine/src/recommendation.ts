export type PlanItemKind = 'resume' | 'reviews' | 'drill' | 'mission' | 'mock';
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
  // CURRICULUM §4 P1-2: a cross-route retrieval drill is available when the app
  // can build one from completed missions (enough questions across routes). The
  // app owns that check and the pool; the engine only slots the item.
  quickDrillAvailable: boolean;
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

  // Interleaved cross-route retrieval, before new content (§4 P1-2): keeps
  // earlier routes alive while later ones are learned, and feeds recent_accuracy
  // a mixed signal instead of a same-topic streak. It appears ONLY when the review
  // queue is empty (vB ruling): due spaced-repetition reviews are the real retrieval
  // work and take precedence, so the quick-drill never competes with them.
  if (i.quickDrillAvailable && i.dueReviews === 0) plan.push({ kind: 'drill' });

  const missionRoute = pickMissionRoute(i.routes);
  if (missionRoute) plan.push({ kind: 'mission', routeId: missionRoute.routeId });

  if (i.dueReviews >= 1 && i.dueReviews <= PLAN_REVIEW_URGENT) plan.push({ kind: 'reviews' });

  if (i.daysToTest < PLAN_MOCK_WINDOW_DAYS && i.mocksAvailable) plan.push({ kind: 'mock' });

  return plan;
}
