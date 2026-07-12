export interface ReadinessInputs {
  mockScores: number[];    // chronological correct-counts of finished mocks, 0..50 each (clamp defensively)
  scoredAnswers: number;   // lifetime answer_event count
  routeCoverage: number;   // 0..1
  dueReviews: number;      // active items due today or earlier
  recentAccuracy: number;  // 0..1
  consistency: number;     // 0..1
}
export type Band = 'low' | 'medium' | 'high';
export type ReadinessComponentKey = 'mock_trend' | 'coverage' | 'review_debt' | 'accuracy' | 'consistency';
export interface ReadinessComponent { key: ReadinessComponentKey; weight: number; value: number }
export interface Readiness { score: number | null; band: Band | null; provisional: boolean; components: ReadinessComponent[] }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const mockTrend = (mockScores: number[]): number => {
  const window = mockScores.slice(-3);
  let weightedSum = 0;
  let weightTotal = 0;
  for (let idx = 0; idx < window.length; idx++) {
    const weight = idx + 1;
    weightedSum += weight * clamp01(window[idx] / 50);
    weightTotal += weight;
  }
  return weightedSum / weightTotal;
};

export function computeReadiness(i: ReadinessInputs): Readiness {
  if (i.mockScores.length === 0 && i.scoredAnswers < 20) {
    return { score: null, band: null, provisional: true, components: [] };
  }

  const full = i.mockScores.length >= 2;
  const norm = full ? 1 : 0.65;

  const components: ReadinessComponent[] = [];
  if (full) {
    components.push({ key: 'mock_trend', weight: 0.35, value: mockTrend(i.mockScores) });
  }
  components.push({ key: 'coverage', weight: 0.25 / norm, value: clamp01(i.routeCoverage) });
  components.push({ key: 'review_debt', weight: 0.15 / norm, value: clamp01(1 - i.dueReviews / 20) });
  components.push({ key: 'accuracy', weight: 0.15 / norm, value: clamp01(i.recentAccuracy) });
  components.push({ key: 'consistency', weight: 0.1 / norm, value: clamp01(i.consistency) });

  const weighted = components.reduce((sum, c) => sum + c.weight * c.value, 0);
  const score = Math.min(100, Math.max(0, Math.round(100 * weighted)));
  const band: Band = score <= 49 ? 'low' : score <= 74 ? 'medium' : 'high';

  return { score, band, provisional: !full, components };
}
