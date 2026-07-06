import { addDaysLocal } from '@/lib/clock';

export function computeStreak(activeDays: string[], today: string): number {
  const days = new Set(activeDays);
  const yesterday = addDaysLocal(today, -1);
  const anchor = days.has(today) ? today : days.has(yesterday) ? yesterday : null;
  if (!anchor) return 0;
  let streak = 0;
  let day = anchor;
  while (days.has(day)) {
    streak += 1;
    day = addDaysLocal(day, -1);
  }
  return streak;
}

const MILESTONES = [3, 7, 14, 30] as const;
export type Milestone = (typeof MILESTONES)[number];

export function hitMilestone(prev: number, next: number): Milestone | null {
  for (const m of MILESTONES) {
    if (next === m && prev < m) return m;
  }
  return null;
}
