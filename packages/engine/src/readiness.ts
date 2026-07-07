export interface ReadinessInputs {
  scoredAnswers: number;   // lifetime answer_event count
  routeCoverage: number;   // completed missions / total missions with content (v1: /5), 0..1
  dueReviews: number;      // active items due today or earlier
  recentAccuracy: number;  // correct fraction of last 50 answers, 0..1
  consistency: number;     // active days in last 14 (incl today) / min(14, days since profile.created_at + 1)
}
export type Band = 'low' | 'medium' | 'high';
export interface Readiness { score: number | null; band: Band | null; provisional: boolean }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function computeReadiness(i: ReadinessInputs): Readiness {
  if (i.scoredAnswers < 20) return { score: null, band: null, provisional: true };
  const debtPenalty = clamp01(1 - i.dueReviews / 20);
  const raw = (clamp01(i.routeCoverage) * 0.25 + debtPenalty * 0.15
             + clamp01(i.recentAccuracy) * 0.15 + clamp01(i.consistency) * 0.10) / 0.65;
  const score = Math.min(100, Math.max(0, Math.round(raw * 100)));
  const band: Band = score <= 49 ? 'low' : score <= 74 ? 'medium' : 'high';
  return { score, band, provisional: true };
}
