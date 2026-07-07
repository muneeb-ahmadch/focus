const MILESTONES = [3, 7, 14, 30] as const;
export type Milestone = (typeof MILESTONES)[number];

export function computeStreak(activeDays: readonly number[], today: number): number {
  const days = new Set(activeDays);
  const anchor = days.has(today) ? today : days.has(today - 1) ? today - 1 : null;
  if (anchor === null) return 0;
  let streak = 0;
  let day = anchor;
  while (days.has(day)) {
    streak += 1;
    day -= 1;
  }
  return streak;
}

export function hitMilestone(prev: number, next: number): Milestone | null {
  for (const m of MILESTONES) {
    if (next === m && prev < m) return m;
  }
  return null;
}
