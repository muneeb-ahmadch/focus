export const XP_MISSION_BASE = 50;
export const XP_PERFECT_BONUS = 10;
export const XP_PER_DRILL_CORRECT = 5;
export const XP_REHAB_CLEAR = 15;

export function missionXp(checkpointScore: number): number {
  if (checkpointScore < 0 || checkpointScore > 1) return XP_MISSION_BASE;
  return XP_MISSION_BASE + (checkpointScore === 1 ? XP_PERFECT_BONUS : 0);
}

export function drillXp(correctCount: number): number {
  return Math.max(0, correctCount) * XP_PER_DRILL_CORRECT;
}

export function rehabXp(cleared: boolean): number {
  return cleared ? XP_REHAB_CLEAR : 0;
}
