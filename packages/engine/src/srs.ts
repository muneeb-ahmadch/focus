const LADDER = [1, 3, 7, 14, 30];

export type SrsGrade = 'wrong' | 'unsure' | 'okay' | 'easy';
export interface SrsState { intervalDays: number; ease: number; lapses: number }
export interface SrsResult extends SrsState { cleared: boolean }

export function newReviewState(): SrsState { return { intervalDays: 1, ease: 2.5, lapses: 0 }; }

export function gradeReview(s: SrsState, grade: SrsGrade): SrsResult {
  if (grade === 'wrong') return { intervalDays: 1, ease: s.ease, lapses: s.lapses + 1, cleared: false };
  if (grade === 'unsure') return { ...s, cleared: false };
  if (s.intervalDays >= 30) return { intervalDays: 30, ease: s.ease, lapses: s.lapses, cleared: true };
  const next = grade === 'easy'
    ? (LADDER.find((d) => d > s.intervalDays) ?? 30)
    : Math.min(30, Math.round(s.intervalDays * 1.7));
  return { intervalDays: next, ease: s.ease, lapses: s.lapses, cleared: false };
}
