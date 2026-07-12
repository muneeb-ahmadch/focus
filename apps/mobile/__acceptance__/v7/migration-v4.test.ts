// Slice v7 gate: migration V4 rebuilds the attempt table (SQLite cannot ALTER a
// CHECK constraint) to admit attempt_type 'mock' and status 'auto_submitted'.
// The rebuild must preserve existing rows AND their attempt_ids (answer_event
// references them), and the upgrade path from a v3 database must be lossless.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/db/adapter';
import { MIGRATIONS, migrate } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';

let db: Db;

beforeEach(() => {
  db = openTestDb();
});

function setupV3WithData(): void {
  for (const batch of MIGRATIONS.slice(0, 3)) db.transaction(() => db.exec(batch));
  db.exec('PRAGMA user_version = 3');
  db.run(
    `INSERT INTO attempt (attempt_type, content_id, status, score, started_at, completed_at)
     VALUES ('lesson', 'r1-m1', 'submitted', 0.8, '2026-07-10T10:00:00Z', '2026-07-10T10:06:00Z')`,
  );
  db.run(
    `INSERT INTO attempt (attempt_type, content_id, status, started_at)
     VALUES ('drill', 'drill', 'in_progress', '2026-07-11T10:00:00Z')`,
  );
  db.run(
    `INSERT INTO answer_event (attempt_id, step_id, concept_id, correct, confidence, answered_at)
     VALUES (1, 'r1-m1-s1', 'c.stopping.overall', 1, 'sure', '2026-07-10T10:01:00Z')`,
  );
}

describe('migration V4: attempt table rebuild', () => {
  it('upgrades a v3 database preserving rows, ids, and the answer_event link', () => {
    setupV3WithData();
    migrate(db);

    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(
      MIGRATIONS.length,
    );
    const rows = db.all<{ attempt_id: number; attempt_type: string; status: string; score: number | null }>(
      'SELECT attempt_id, attempt_type, status, score FROM attempt ORDER BY attempt_id',
    );
    expect(rows).toEqual([
      { attempt_id: 1, attempt_type: 'lesson', status: 'submitted', score: 0.8 },
      { attempt_id: 2, attempt_type: 'drill', status: 'in_progress', score: null },
    ]);
    const joined = db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM answer_event ae JOIN attempt a ON a.attempt_id = ae.attempt_id`,
    );
    expect(joined?.n).toBe(1);
  });

  it("admits attempt_type 'mock' and status 'auto_submitted' after migration", () => {
    migrate(db);
    db.run(
      `INSERT INTO attempt (attempt_type, content_id, status, started_at)
       VALUES ('mock', 'mock', 'in_progress', '2026-07-12T10:00:00Z')`,
    );
    db.run(
      `UPDATE attempt SET status = 'auto_submitted', completed_at = '2026-07-12T11:00:00Z'
       WHERE attempt_type = 'mock'`,
    );
    const row = db.get<{ status: string }>(
      `SELECT status FROM attempt WHERE attempt_type = 'mock'`,
    );
    expect(row?.status).toBe('auto_submitted');
  });

  it('still rejects unknown attempt types and statuses (CHECKs survived the rebuild)', () => {
    migrate(db);
    expect(() =>
      db.run(
        `INSERT INTO attempt (attempt_type, content_id, status, started_at)
         VALUES ('hazard', 'x', 'in_progress', '2026-07-12T10:00:00Z')`,
      ),
    ).toThrow();
    expect(() =>
      db.run(
        `INSERT INTO attempt (attempt_type, content_id, status, started_at)
         VALUES ('lesson', 'x', 'paused', '2026-07-12T10:00:00Z')`,
      ),
    ).toThrow();
  });

  it('a tampered db claiming v4 with an old-shape attempt table fails loudly at migrate (R4)', () => {
    for (const batch of MIGRATIONS.slice(0, 3)) db.transaction(() => db.exec(batch));
    db.exec(`PRAGMA user_version = ${MIGRATIONS.length}`);
    expect(() => migrate(db)).toThrow(/attempt/);
  });

  it('migrate is idempotent across reruns on an upgraded database', () => {
    setupV3WithData();
    migrate(db);
    migrate(db);
    const rows = db.all<{ attempt_id: number }>('SELECT attempt_id FROM attempt');
    expect(rows).toHaveLength(2);
  });
});
