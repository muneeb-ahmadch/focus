// Slice v9 gate: the daily plan is a deterministic priority chain —
// resume > review debt >10 > weakest incomplete route > light reviews >
// exam-proximity mock escalation (<14d), collapsing to resume/reviews/mock
// only inside the final-days window (<3d). Every rule pair is ordered here;
// the engine never invents an item the inputs can't justify.
import { describe, expect, it } from 'vitest';
import {
  buildDailyPlan,
  PLAN_FINAL_DAYS,
  PLAN_MOCK_WINDOW_DAYS,
  PLAN_REVIEW_URGENT,
  type PlanInputs,
  type PlanItem,
} from '../src/recommendation';

const routes = () => [
  { routeId: 'route-1', mastery: 0.62, completedMissions: 2, totalMissions: 5 },
  { routeId: 'route-3', mastery: 0.3, completedMissions: 0, totalMissions: 3 },
  { routeId: 'route-2', mastery: 0.3, completedMissions: 1, totalMissions: 4 },
];

const base = (over: Partial<PlanInputs> = {}): PlanInputs => ({
  hasResume: false,
  dueReviews: 0,
  routes: routes(),
  daysToTest: 30,
  mocksAvailable: false,
  ...over,
});

const kinds = (plan: PlanItem[]) => plan.map((p) => p.kind);

describe('locked constants', () => {
  it('review-urgent threshold 10, mock window 14, final window 3', () => {
    expect(PLAN_REVIEW_URGENT).toBe(10);
    expect(PLAN_MOCK_WINDOW_DAYS).toBe(14);
    expect(PLAN_FINAL_DAYS).toBe(3);
  });
});

describe('priority pairs (normal mode)', () => {
  it('resume outranks urgent reviews', () => {
    const plan = buildDailyPlan(base({ hasResume: true, dueReviews: 25 }));
    expect(kinds(plan).slice(0, 2)).toEqual(['resume', 'reviews']);
  });

  it('resume outranks the mission', () => {
    const plan = buildDailyPlan(base({ hasResume: true }));
    expect(kinds(plan)).toEqual(['resume', 'mission']);
  });

  it('urgent review debt (11) outranks the mission', () => {
    const plan = buildDailyPlan(base({ dueReviews: PLAN_REVIEW_URGENT + 1 }));
    expect(kinds(plan)).toEqual(['reviews', 'mission']);
  });

  it('review debt of exactly 10 is NOT urgent — mission first, reviews after', () => {
    const plan = buildDailyPlan(base({ dueReviews: PLAN_REVIEW_URGENT }));
    expect(kinds(plan)).toEqual(['mission', 'reviews']);
  });

  it('a single due review still lands in the plan, after the mission', () => {
    const plan = buildDailyPlan(base({ dueReviews: 1 }));
    expect(kinds(plan)).toEqual(['mission', 'reviews']);
  });

  it('zero due reviews → no reviews item', () => {
    const plan = buildDailyPlan(base());
    expect(kinds(plan)).toEqual(['mission']);
  });

  it('the mission outranks the escalated mock', () => {
    const plan = buildDailyPlan(base({ daysToTest: 10, mocksAvailable: true }));
    expect(kinds(plan)).toEqual(['mission', 'mock']);
  });

  it('light reviews outrank the escalated mock', () => {
    const plan = buildDailyPlan(base({ dueReviews: 3, daysToTest: 10, mocksAvailable: true }));
    expect(kinds(plan)).toEqual(['mission', 'reviews', 'mock']);
  });

  it('urgent reviews appear exactly once, never a second slot', () => {
    const plan = buildDailyPlan(base({ dueReviews: 40, daysToTest: 10, mocksAvailable: true }));
    expect(kinds(plan)).toEqual(['reviews', 'mission', 'mock']);
  });

  it('full chain: resume, urgent reviews, mission, mock', () => {
    const plan = buildDailyPlan(
      base({ hasResume: true, dueReviews: 12, daysToTest: 5, mocksAvailable: true }),
    );
    expect(kinds(plan)).toEqual(['resume', 'reviews', 'mission', 'mock']);
  });
});

describe('mission selection', () => {
  it('picks the weakest incomplete route, tie broken by route id', () => {
    const plan = buildDailyPlan(base());
    expect(plan[0]).toEqual({ kind: 'mission', routeId: 'route-2' });
  });

  it('a completed route is never recommended, whatever its mastery', () => {
    const withCompleted = [
      { routeId: 'route-1', mastery: 0.62, completedMissions: 2, totalMissions: 5 },
      { routeId: 'route-2', mastery: 0.1, completedMissions: 4, totalMissions: 4 },
    ];
    const plan = buildDailyPlan(base({ routes: withCompleted }));
    expect(plan[0]).toEqual({ kind: 'mission', routeId: 'route-1' });
  });

  it('a route with no authored content is never recommended', () => {
    const withEmpty = [
      { routeId: 'route-1', mastery: 0.62, completedMissions: 2, totalMissions: 5 },
      { routeId: 'route-7', mastery: 0, completedMissions: 0, totalMissions: 0 },
    ];
    const plan = buildDailyPlan(base({ routes: withEmpty }));
    expect(plan[0]).toEqual({ kind: 'mission', routeId: 'route-1' });
  });

  it('all routes complete → no mission item', () => {
    const done = [{ routeId: 'route-1', mastery: 0.9, completedMissions: 5, totalMissions: 5 }];
    const plan = buildDailyPlan(base({ routes: done, dueReviews: 2 }));
    expect(kinds(plan)).toEqual(['reviews']);
  });

  it('no routes at all → no mission item', () => {
    const plan = buildDailyPlan(base({ routes: [] }));
    expect(plan).toEqual([]);
  });
});

describe('exam proximity — mock escalation (<14d)', () => {
  it('at exactly 14 days the mock is NOT escalated', () => {
    const plan = buildDailyPlan(base({ daysToTest: PLAN_MOCK_WINDOW_DAYS, mocksAvailable: true }));
    expect(kinds(plan)).toEqual(['mission']);
  });

  it('at 13 days the mock joins the plan', () => {
    const plan = buildDailyPlan(
      base({ daysToTest: PLAN_MOCK_WINDOW_DAYS - 1, mocksAvailable: true }),
    );
    expect(kinds(plan)).toEqual(['mission', 'mock']);
  });

  it('mocks unavailable → never a mock item, however close the test', () => {
    const plan = buildDailyPlan(base({ daysToTest: 5, mocksAvailable: false }));
    expect(kinds(plan)).toEqual(['mission']);
  });
});

describe('exam proximity — final days (<3d): mocks and reviews only', () => {
  it('at exactly 3 days missions still run (escalated mode, not final)', () => {
    const plan = buildDailyPlan(base({ daysToTest: PLAN_FINAL_DAYS, mocksAvailable: true }));
    expect(kinds(plan)).toEqual(['mission', 'mock']);
  });

  it('at 2 days the mission is dropped: reviews then mock', () => {
    const plan = buildDailyPlan(
      base({ daysToTest: 2, dueReviews: 4, mocksAvailable: true }),
    );
    expect(kinds(plan)).toEqual(['reviews', 'mock']);
  });

  it('final days: resume still leads — an open mission is never stranded', () => {
    const plan = buildDailyPlan(
      base({ hasResume: true, daysToTest: 1, dueReviews: 4, mocksAvailable: true }),
    );
    expect(kinds(plan)).toEqual(['resume', 'reviews', 'mock']);
  });

  it('test day itself (0) behaves as final days', () => {
    const plan = buildDailyPlan(base({ daysToTest: 0, dueReviews: 1, mocksAvailable: true }));
    expect(kinds(plan)).toEqual(['reviews', 'mock']);
  });

  it('a test date in the past behaves as final days, never crashes', () => {
    const plan = buildDailyPlan(base({ daysToTest: -5, mocksAvailable: true }));
    expect(kinds(plan)).toEqual(['mock']);
  });

  it('final days with nothing to do → empty plan', () => {
    const plan = buildDailyPlan(base({ daysToTest: 1, mocksAvailable: false }));
    expect(plan).toEqual([]);
  });
});

describe('empty and inert states', () => {
  it('everything cleared on a normal day → empty plan, not an invented item', () => {
    const done = [{ routeId: 'route-1', mastery: 0.9, completedMissions: 5, totalMissions: 5 }];
    const plan = buildDailyPlan(base({ routes: done }));
    expect(plan).toEqual([]);
  });

  it('inputs are not mutated and the result is deterministic', () => {
    const input = base({ hasResume: true, dueReviews: 12, daysToTest: 5, mocksAvailable: true });
    const snapshot = JSON.parse(JSON.stringify(input)) as PlanInputs;
    const a = buildDailyPlan(input);
    const b = buildDailyPlan(input);
    expect(input).toEqual(snapshot);
    expect(a).toEqual(b);
  });
});
