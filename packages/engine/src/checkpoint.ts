export interface CheckpointResult {
  score: number;
  passed: boolean;
  missedConceptIds: string[];
}

export function gradeCheckpoint(
  answers: { conceptId: string; correct: boolean }[],
): CheckpointResult {
  const score = answers.length === 0
    ? 0
    : answers.filter((a) => a.correct).length / answers.length;
  const passed = score >= 0.8;
  const missedConceptIds = [...new Set(answers.filter((a) => !a.correct).map((a) => a.conceptId))];
  return { score, passed, missedConceptIds };
}
