import type { SrsGrade } from './srs';

export interface RehabAnswer { correct: boolean; confidence: 'sure' | 'unsure' }
export interface RehabResult { cleared: boolean; grade: SrsGrade }

export function rehabOutcome(answers: RehabAnswer[]): RehabResult {
  if (answers.length === 0) return { cleared: false, grade: 'unsure' };
  if (answers.some((a) => !a.correct)) return { cleared: false, grade: 'wrong' };
  const last = answers[answers.length - 1]!;
  if (last.confidence === 'sure') return { cleared: true, grade: 'easy' };
  return { cleared: false, grade: 'unsure' };
}
