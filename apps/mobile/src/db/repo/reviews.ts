import { addDaysLocal } from '@/lib/clock';
import { gradeReview, type SrsGrade } from '@focus/engine';
import type { Db } from '../adapter';

export type ReviewOrigin = 'wrong' | 'unsure' | 'slow' | 'hint_heavy';
export type ReviewStatus = 'active' | 'cleared' | 'snoozed';

export interface ReviewItem {
  concept_id: string;
  origin_type: ReviewOrigin;
  due_at: string;
  interval_days: number;
  ease: number;
  lapses: number;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
}

export function getDue(db: Db, today: string): ReviewItem[] {
  return db.all<ReviewItem>(
    `SELECT * FROM review_item
     WHERE status = 'active' AND due_at <= ?
     ORDER BY due_at, concept_id`,
    [today],
  );
}

export function getAllReviewItems(db: Db): ReviewItem[] {
  return db.all<ReviewItem>('SELECT * FROM review_item ORDER BY due_at, concept_id');
}

export function countActiveDueOnOrBefore(db: Db, day: string): number {
  return (
    db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM review_item WHERE status = 'active' AND due_at <= ?`,
      [day],
    )?.n ?? 0
  );
}

export function getActiveLapsedConcepts(db: Db): string[] {
  return db
    .all<{ concept_id: string }>(
      `SELECT concept_id FROM review_item WHERE status = 'active' AND lapses >= 1`,
    )
    .map((r) => r.concept_id);
}

export function upsertMiss(db: Db, conceptId: string, origin: ReviewOrigin, today: string): void {
  const existing = db.get<ReviewItem>(
    'SELECT * FROM review_item WHERE concept_id = ?',
    [conceptId],
  );
  const due = addDaysLocal(today, 1);
  if (!existing) {
    db.run(
      `INSERT INTO review_item (concept_id, origin_type, due_at, interval_days, lapses, status, created_at, updated_at)
       VALUES (?, ?, ?, 1, 0, 'active', ?, ?)`,
      [conceptId, origin, due, today, today],
    );
    return;
  }
  db.run(
    `UPDATE review_item
     SET status = 'active', interval_days = 1, due_at = ?, lapses = lapses + 1, updated_at = ?
     WHERE concept_id = ?`,
    [due, today, conceptId],
  );
}

export function applyGrade(db: Db, conceptId: string, grade: SrsGrade, today: string): void {
  const item = db.get<ReviewItem>('SELECT * FROM review_item WHERE concept_id = ?', [conceptId]);
  if (!item) return;
  const next = gradeReview(
    { intervalDays: item.interval_days, ease: item.ease, lapses: item.lapses },
    grade,
  );
  db.run(
    `UPDATE review_item
     SET interval_days = ?, lapses = ?, due_at = ?, status = ?, updated_at = ?
     WHERE concept_id = ?`,
    [
      next.intervalDays,
      next.lapses,
      addDaysLocal(today, next.intervalDays),
      next.cleared ? 'cleared' : 'active',
      today,
      conceptId,
    ],
  );
}
