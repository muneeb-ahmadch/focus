// Slice v13 gate: ResetConfirm must "actually clear everything" — after a reset
// the database is byte-for-byte what a brand-new install produces (empty user
// tables, re-seeded route_state + misconception, user_version 7, empty analytics
// queue, no install identity). This is a DEEP compare, not a table walk.
import { beforeEach, describe, expect, it } from 'vitest';
import { getRouteManifest, MISCONCEPTIONS } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { resetDatabase } from '@/db/reset';
import { syncMisconceptionsFromContent } from '@/db/repo/misconceptions';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';

function freshInstall(): Db {
  const db = openTestDb();
  migrate(db);
  syncRoutesFromContent(db, getRouteManifest());
  syncMisconceptionsFromContent(db, MISCONCEPTIONS);
  return db;
}

interface Snapshot {
  userVersion: number;
  tables: Record<string, { sql: string; rows: string[] }>;
}

function snapshot(db: Db): Snapshot {
  const userVersion =
    db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? -1;
  const names = db
    .all<{ name: string; sql: string }>(
      `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .filter((t) => t.sql != null);
  const tables: Snapshot['tables'] = {};
  for (const { name, sql } of names) {
    const rows = db
      .all<Record<string, unknown>>(`SELECT * FROM "${name}"`)
      .map((r) => JSON.stringify(r))
      .sort();
    tables[name] = { sql, rows };
  }
  return { userVersion, tables };
}

// Dirty every user table the way real usage would, plus mutate a re-seeded table
// (route_state mastery, delete a misconception) so a lazy "delete-user-rows" reset
// that skips re-seeding would fail the compare.
function populate(db: Db): void {
  db.run(
    `INSERT INTO user_profile (user_id, test_date, daily_minutes_target, study_days_json, created_at,
       auto_play_audio, reduce_motion, high_contrast, dyslexia_font)
     VALUES ('local', '2026-08-05', 30, '[1,3,5]', '2026-07-01', 0, 1, 1, 1)`,
  );
  db.run(`UPDATE route_state SET mastery = 0.77, completed_missions = 3 WHERE route_id = 'route-1'`);
  db.run(
    `INSERT INTO mission_state (mission_id, route_id, status, current_step_index)
     VALUES ('r1-m1', 'route-1', 'in_progress', 4)`,
  );
  db.run(
    `INSERT INTO review_item (concept_id, origin_type, due_at, created_at, updated_at)
     VALUES ('c.speed.limit', 'wrong', '2026-07-15', '2026-07-14', '2026-07-14')`,
  );
  db.run(
    `INSERT INTO attempt (attempt_type, content_id, status, started_at)
     VALUES ('mock', 'mock-1', 'submitted', '2026-07-14T10:00:00.000Z')`,
  );
  db.run(
    `INSERT INTO answer_event (attempt_id, step_id, concept_id, correct, confidence, answered_at)
     VALUES (1, 's1', 'c.speed.limit', 1, 'sure', '2026-07-14T10:01:00.000Z')`,
  );
  db.run(
    `INSERT INTO daily_activity (day, missions_completed, xp) VALUES ('2026-07-14', 1, 60)`,
  );
  db.run(
    `INSERT INTO analytics_event (event_id, name, occurred_at)
     VALUES ('11111111-1111-4111-8111-111111111111', 'app_open', '2026-07-14T10:00:00.000Z')`,
  );
  db.run(`INSERT INTO app_meta (key, value) VALUES ('install_id', 'abc-123')`);
  db.run(`DELETE FROM misconception WHERE misconception_id = (SELECT misconception_id FROM misconception LIMIT 1)`);
}

let fresh: Db;

beforeEach(() => {
  fresh = freshInstall();
});

describe('resetDatabase — equals a fresh install', () => {
  it('a heavily-used DB, after reset, is byte-identical to a fresh install', () => {
    const dirty = freshInstall();
    populate(dirty);
    // sanity: the dirty DB really diverged before reset
    expect(snapshot(dirty)).not.toEqual(snapshot(fresh));

    resetDatabase(dirty);

    expect(snapshot(dirty)).toEqual(snapshot(fresh));
  });

  it('re-seeds route_state and misconception content (not just deletes user rows)', () => {
    const dirty = freshInstall();
    populate(dirty);
    resetDatabase(dirty);

    const routes = dirty.get<{ n: number }>('SELECT COUNT(*) AS n FROM route_state')?.n ?? 0;
    const miscs = dirty.get<{ n: number }>('SELECT COUNT(*) AS n FROM misconception')?.n ?? 0;
    expect(routes).toBe(fresh.get<{ n: number }>('SELECT COUNT(*) AS n FROM route_state')?.n);
    expect(miscs).toBe(MISCONCEPTIONS.length);
    // route_state mastery is back to the seed (0), not the dirtied 0.77
    const m = dirty.get<{ mastery: number }>(`SELECT mastery FROM route_state WHERE route_id = 'route-1'`);
    expect(m?.mastery).toBe(0);
  });

  it('clears every user table and the analytics queue, keeps user_version at 7', () => {
    const dirty = freshInstall();
    populate(dirty);
    resetDatabase(dirty);

    for (const table of [
      'user_profile',
      'mission_state',
      'review_item',
      'attempt',
      'answer_event',
      'daily_activity',
      'analytics_event',
      'app_meta',
    ]) {
      const n = dirty.get<{ n: number }>(`SELECT COUNT(*) AS n FROM "${table}"`)?.n ?? -1;
      expect(n, `${table} not empty after reset`).toBe(0);
    }
    expect(dirty.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(7);
  });

  it('is idempotent (reset of a fresh DB stays a fresh DB) and reusable afterwards', () => {
    const dirty = freshInstall();
    resetDatabase(dirty);
    expect(snapshot(dirty)).toEqual(snapshot(fresh));

    // the DB is fully usable again — onboarding can write a new profile
    expect(() =>
      dirty.run(
        `INSERT INTO user_profile (user_id, test_date, daily_minutes_target, created_at)
         VALUES ('local', '2026-09-01', 10, '2026-07-14')`,
      ),
    ).not.toThrow();
  });
});
