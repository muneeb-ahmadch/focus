import type { Db } from './adapter';

const V1 = `
CREATE TABLE user_profile (
  user_id TEXT PRIMARY KEY DEFAULT 'local',
  test_date TEXT NOT NULL,
  daily_minutes_target INTEGER NOT NULL,
  study_days_json TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,7]',
  auto_play_audio INTEGER NOT NULL DEFAULT 1,
  reduce_motion INTEGER NOT NULL DEFAULT 0,
  high_contrast INTEGER NOT NULL DEFAULT 0,
  dyslexia_font INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE route_state (
  route_id TEXT PRIMARY KEY,
  mastery REAL NOT NULL DEFAULT 0,
  completed_missions INTEGER NOT NULL DEFAULT 0,
  total_missions INTEGER NOT NULL DEFAULT 0,
  weak_concept_count INTEGER NOT NULL DEFAULT 0,
  due_review_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT
);
CREATE TABLE mission_state (
  mission_id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','completed','failed_checkpoint')),
  best_checkpoint_score REAL,
  current_step_index INTEGER NOT NULL DEFAULT 0,
  resume_payload_json TEXT,
  updated_at TEXT
);
CREATE TABLE review_item (
  concept_id TEXT PRIMARY KEY,
  origin_type TEXT NOT NULL CHECK (origin_type IN ('wrong','unsure','slow','hint_heavy')),
  due_at TEXT NOT NULL,
  interval_days INTEGER NOT NULL DEFAULT 1,
  ease REAL NOT NULL DEFAULT 2.5,
  lapses INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cleared','snoozed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_review_due ON review_item (status, due_at);
CREATE TABLE attempt (
  attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_type TEXT NOT NULL CHECK (attempt_type IN ('lesson','drill')),
  content_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress','submitted','abandoned')),
  score REAL,
  result_payload_json TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE answer_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL REFERENCES attempt(attempt_id),
  step_id TEXT NOT NULL,
  concept_id TEXT NOT NULL,
  correct INTEGER NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('sure','unsure')),
  misconception_id TEXT,
  answered_at TEXT NOT NULL
);
CREATE INDEX idx_answer_time ON answer_event (answered_at);
CREATE TABLE daily_activity (
  day TEXT PRIMARY KEY,
  missions_completed INTEGER NOT NULL DEFAULT 0,
  reviews_cleared INTEGER NOT NULL DEFAULT 0,
  answers_scored INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE app_meta ( key TEXT PRIMARY KEY, value TEXT NOT NULL );
`;

export const MIGRATIONS: string[] = [V1];

export function migrate(db: Db): void {
  const row = db.get<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    const batch = MIGRATIONS[v];
    db.transaction(() => db.exec(batch));
    db.exec(`PRAGMA user_version = ${v + 1}`);
  }
}
