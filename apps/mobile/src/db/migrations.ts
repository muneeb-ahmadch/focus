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

const V2 = `
CREATE TABLE misconception (
  misconception_id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL,
  wrong_belief TEXT NOT NULL,
  repair_note TEXT NOT NULL,
  source_ref TEXT NOT NULL
);
`;

const V3 = `
ALTER TABLE daily_activity ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;
`;

const V4 = `
CREATE TABLE attempt_new (
  attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_type TEXT NOT NULL CHECK (attempt_type IN ('lesson','drill','mock')),
  content_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress','submitted','abandoned','auto_submitted')),
  score REAL,
  result_payload_json TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
INSERT INTO attempt_new
  (attempt_id, attempt_type, content_id, status, score, result_payload_json, started_at, completed_at)
  SELECT attempt_id, attempt_type, content_id, status, score, result_payload_json, started_at, completed_at
  FROM attempt;
DROP TABLE attempt;
ALTER TABLE attempt_new RENAME TO attempt;
`;

export const MIGRATIONS: string[] = [V1, V2, V3, V4];

export function migrate(db: Db): void {
  const row = db.get<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current < MIGRATIONS.length) {
    // V4 rebuilds the attempt table, which answer_event references; SQLite cannot
    // defer that FK check across a DROP, so enforcement is off for the rebuild and
    // restored to its prior value after (foreign_keys is a no-op inside a transaction).
    const fk = db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys ?? 0;
    db.exec('PRAGMA foreign_keys = OFF');
    for (let v = current; v < MIGRATIONS.length; v++) {
      const batch = MIGRATIONS[v];
      db.transaction(() => db.exec(batch));
      db.exec(`PRAGMA user_version = ${v + 1}`);
    }
    db.exec(`PRAGMA foreign_keys = ${fk ? 'ON' : 'OFF'}`);
  }

  const version = db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
  for (const requiredTable of ['user_profile', 'misconception', 'attempt']) {
    const table = db.get<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
      [requiredTable],
    );
    if (!table) {
      throw new Error(
        `Database corrupt: user_version is ${version} but table '${requiredTable}' does not exist.`,
      );
    }
  }
  // table existence alone can't prove V4's rebuild ran (R4): verify the widened CHECK
  const attemptSql = db.get<{ sql: string }>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'attempt'`,
  );
  if (!attemptSql?.sql.includes("'auto_submitted'")) {
    throw new Error(
      `Database corrupt: user_version is ${version} but the attempt table predates migration V4.`,
    );
  }
}
