const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function computeRouteMastery(i: {
  completed: number;
  total: number;
  checkpointScores: number[];
  weakConcepts: number;
}): number {
  const avg = i.checkpointScores.length === 0
    ? 0
    : i.checkpointScores.reduce((a, b) => a + b, 0) / i.checkpointScores.length;
  const completion = i.total === 0 ? 0 : i.completed / i.total;
  return clamp01(0.6 * completion + 0.4 * avg - 0.03 * i.weakConcepts);
}
