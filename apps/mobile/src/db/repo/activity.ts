import type { Db } from '../adapter';

export type ActivityField = 'missions_completed' | 'reviews_cleared' | 'answers_scored';

export interface DailyActivity {
  day: string;
  missions_completed: number;
  reviews_cleared: number;
  answers_scored: number;
}

const FIELDS: readonly ActivityField[] = ['missions_completed', 'reviews_cleared', 'answers_scored'];

export function bumpActivity(db: Db, day: string, field: ActivityField): void {
  if (!FIELDS.includes(field)) return;
  db.run(
    `INSERT INTO daily_activity (day, ${field}) VALUES (?, 1)
     ON CONFLICT(day) DO UPDATE SET ${field} = ${field} + 1`,
    [day],
  );
}

export function getActivity(db: Db): DailyActivity[] {
  return db.all<DailyActivity>('SELECT * FROM daily_activity ORDER BY day');
}

export function getActiveDays(db: Db): string[] {
  return db
    .all<{ day: string }>(
      'SELECT day FROM daily_activity WHERE missions_completed > 0 OR reviews_cleared > 0',
    )
    .map((r) => r.day);
}

export function getScoredCount(db: Db): number {
  return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM answer_event')?.n ?? 0;
}

export function getRecentAccuracy(db: Db, limit = 50): number {
  const rows = db.all<{ correct: number }>(
    'SELECT correct FROM answer_event ORDER BY id DESC LIMIT ?',
    [limit],
  );
  if (rows.length === 0) return 0;
  return rows.filter((r) => r.correct === 1).length / rows.length;
}
