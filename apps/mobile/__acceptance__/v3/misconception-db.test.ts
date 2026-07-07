import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MISCONCEPTIONS } from '@/content';
import { MIGRATIONS, migrate } from '@/db/migrations';
import { syncMisconceptionsFromContent } from '@/db/repo/misconceptions';
import { openTestDb } from '@/db/testing/adapter.node';

const COLUMNS = ['misconception_id', 'concept_id', 'wrong_belief', 'repair_note', 'source_ref'];

interface MisconceptionRow {
  misconception_id: string;
  concept_id: string;
  wrong_belief: string;
  repair_note: string;
  source_ref: string;
}

describe('misconception table migration', () => {
  it('fresh database lands on the latest user_version with the misconception table', () => {
    const db = openTestDb();
    migrate(db);
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(
      MIGRATIONS.length,
    );
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(2);
    const cols = db
      .all<{ name: string }>('PRAGMA table_info(misconception)')
      .map((c) => c.name)
      .sort();
    expect(cols).toEqual([...COLUMNS].sort());
  });

  it('a v1 database upgrades in place without losing rows', () => {
    const db = openTestDb();
    db.transaction(() => db.exec(MIGRATIONS[0]!));
    db.exec('PRAGMA user_version = 1');
    db.run(
      `INSERT INTO review_item (concept_id, origin_type, due_at, created_at, updated_at)
       VALUES ('c.t.alpha', 'wrong', '2026-07-01', '2026-07-01', '2026-07-01')`,
    );
    migrate(db);
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(
      MIGRATIONS.length,
    );
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM review_item')?.n).toBe(1);
    expect(
      db.get<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'misconception'`,
      ),
    ).toBeDefined();
  });

  it('re-running migrate on a fully migrated database is a no-op', () => {
    const db = openTestDb();
    migrate(db);
    expect(() => migrate(db)).not.toThrow();
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(
      MIGRATIONS.length,
    );
  });
});

describe('misconception seeding from the pack', () => {
  it('seeds one row per taxonomy entry and is idempotent', () => {
    const db = openTestDb();
    migrate(db);
    expect(MISCONCEPTIONS.length).toBeGreaterThanOrEqual(30);
    syncMisconceptionsFromContent(db, MISCONCEPTIONS);
    const count = () => db.get<{ n: number }>('SELECT COUNT(*) AS n FROM misconception')?.n;
    expect(count()).toBe(MISCONCEPTIONS.length);
    syncMisconceptionsFromContent(db, MISCONCEPTIONS);
    expect(count()).toBe(MISCONCEPTIONS.length);
  });

  it('seeded rows carry the content values', () => {
    const db = openTestDb();
    migrate(db);
    syncMisconceptionsFromContent(db, MISCONCEPTIONS);
    const entry = MISCONCEPTIONS[0]!;
    const row = db.get<MisconceptionRow>(
      'SELECT * FROM misconception WHERE misconception_id = ?',
      [entry.misconceptionId],
    );
    expect(row).toEqual({
      misconception_id: entry.misconceptionId,
      concept_id: entry.conceptId,
      wrong_belief: entry.wrongBelief,
      repair_note: entry.repairNote,
      source_ref: entry.sourceRef,
    });
  });

  it('re-seeding refreshes a tampered row back to content truth (upsert)', () => {
    const db = openTestDb();
    migrate(db);
    syncMisconceptionsFromContent(db, MISCONCEPTIONS);
    const entry = MISCONCEPTIONS[0]!;
    db.run('UPDATE misconception SET repair_note = ? WHERE misconception_id = ?', [
      'tampered',
      entry.misconceptionId,
    ]);
    syncMisconceptionsFromContent(db, MISCONCEPTIONS);
    const row = db.get<MisconceptionRow>(
      'SELECT repair_note FROM misconception WHERE misconception_id = ?',
      [entry.misconceptionId],
    );
    expect(row?.repair_note).toBe(entry.repairNote);
  });

  it('boot wiring: getDb() seeds misconceptions alongside routes', () => {
    const source = readFileSync(join(__dirname, '../../src/db/index.ts'), 'utf8');
    expect(
      source.includes('syncMisconceptionsFromContent('),
      'db/index.ts must call syncMisconceptionsFromContent at boot — a seeding function with zero production callers is dead wiring',
    ).toBe(true);
  });
});
