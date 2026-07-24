export interface CheckpointResult {
  score: number;
  passed: boolean;
  // A perfect checkpoint (5/5). Distinct from a plain pass (4/5): mastery earns the perfect XP
  // bonus. Locked decision #4 / CURRICULUM P0-3.
  mastered: boolean;
  missedConceptIds: string[];
}

export function gradeCheckpoint(
  answers: { conceptId: string; correct: boolean }[],
): CheckpointResult {
  const score = answers.length === 0
    ? 0
    : answers.filter((a) => a.correct).length / answers.length;
  const passed = score >= 0.8;
  const mastered = answers.length > 0 && score === 1;
  const missedConceptIds = [...new Set(answers.filter((a) => !a.correct).map((a) => a.conceptId))];
  return { score, passed, mastered, missedConceptIds };
}
