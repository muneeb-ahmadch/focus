import { now, todayLocal } from '@/lib/clock';
import type { Db } from '../adapter';
import { bumpActivity } from './activity';

export type AttemptType = 'lesson' | 'drill';
export type AttemptStatus = 'in_progress' | 'submitted' | 'abandoned';

export function abandonStaleAttempts(db: Db): void {
  db.run(
    `UPDATE attempt SET status = 'abandoned', completed_at = ? WHERE status = 'in_progress'`,
    [now().toISOString()],
  );
}

export function startAttempt(db: Db, type: AttemptType, contentId: string): number {
  abandonStaleAttempts(db);
  db.run(
    `INSERT INTO attempt (attempt_type, content_id, status, started_at)
     VALUES (?, ?, 'in_progress', ?)`,
    [type, contentId, now().toISOString()],
  );
  const row = db.get<{ id: number }>('SELECT last_insert_rowid() AS id');
  return row?.id ?? 0;
}

export function finishAttempt(
  db: Db,
  id: number,
  status: AttemptStatus,
  score: number | null,
  payloadJson: string | null,
): void {
  db.run(
    `UPDATE attempt SET status = ?, score = ?, result_payload_json = ?, completed_at = ?
     WHERE attempt_id = ? AND status = 'in_progress'`,
    [status, score, payloadJson, now().toISOString(), id],
  );
}

export function recordAnswer(
  db: Db,
  attemptId: number,
  a: {
    stepId: string;
    conceptId: string;
    correct: boolean;
    confidence: 'sure' | 'unsure';
    misconceptionId?: string;
  },
): void {
  db.run(
    `INSERT INTO answer_event (attempt_id, step_id, concept_id, correct, confidence, misconception_id, answered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      attemptId,
      a.stepId,
      a.conceptId,
      a.correct ? 1 : 0,
      a.confidence,
      a.misconceptionId ?? null,
      now().toISOString(),
    ],
  );
  bumpActivity(db, todayLocal(), 'answers_scored');
}
