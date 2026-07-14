// Slice v10 gate: migration V6 widens attempt.attempt_type to admit
// 'practice' (SQLite can't ALTER a CHECK — table rebuild, v7's V4 pattern).
// Lossless on upgrade, loud on tamper (R4), idempotent.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/db/adapter';
import { migrate, MIGRATIONS } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';

const h = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));

let db: Db;

function buildV5Db(): Db {
  const raw = openTestDb();
  raw.exec('PRAGMA foreign_keys = OFF');
  for (const batch of MIGRATIONS.slice(0, 5)) raw.exec(batch);
  raw.exec('PRAGMA user_version = 5');
  return raw;
}

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  h.db = db;
});

describe('migration V6 — attempt_type admits practice', () => {
  it('fresh install: practice attempts insert cleanly, user_version is 6', () => {
    expect(() =>
      db.run(
        `INSERT INTO attempt (attempt_type, content_id, status, started_at)
         VALUES ('practice', 'topic:lights', 'in_progress', '2026-07-13T10:00:00.000Z')`,
      ),
    ).not.toThrow();
    expect(
      db.get<{ user_version: number }>('PRAGMA user_version')!.user_version,
    ).toBeGreaterThanOrEqual(6);
  });

  it('every pre-existing attempt type still inserts', () => {
    for (const type of ['lesson', 'drill', 'mock']) {
      expect(() =>
        db.run(
          `INSERT INTO attempt (attempt_type, content_id, status, started_at)
           VALUES (?, 'x', 'submitted', '2026-07-13T10:00:00.000Z')`,
          [type],
        ),
      ).not.toThrow();
    }
    expect(() =>
      db.run(
        `INSERT INTO attempt (attempt_type, content_id, status, started_at)
         VALUES ('nonsense', 'x', 'submitted', '2026-07-13T10:00:00.000Z')`,
      ),
    ).toThrow();
  });

  it('upgrade from V5 preserves attempts, ids, and answer_event links', () => {
    const v5 = buildV5Db();
    v5.run(
      `INSERT INTO attempt (attempt_type, content_id, status, started_at, score)
       VALUES ('mock', 'mock', 'submitted', '2026-07-01T10:00:00.000Z', 44)`,
    );
    const attemptId = v5.get<{ id: number }>('SELECT last_insert_rowid() AS id')!.id;
    v5.run(
      `INSERT INTO answer_event (attempt_id, step_id, concept_id, correct, confidence, answered_at)
       VALUES (?, 's1', 'c.lights.night', 1, 'sure', '2026-07-01T10:05:00.000Z')`,
      [attemptId],
    );
    migrate(v5);
    const row = v5.get<{ attempt_id: number; attempt_type: string; score: number }>(
      'SELECT attempt_id, attempt_type, score FROM attempt',
    );
    expect(row).toEqual({ attempt_id: attemptId, attempt_type: 'mock', score: 44 });
    const evt = v5.get<{ attempt_id: number }>('SELECT attempt_id FROM answer_event');
    expect(evt?.attempt_id).toBe(attemptId);
    expect(
      v5.get<{ user_version: number }>('PRAGMA user_version')!.user_version,
    ).toBeGreaterThanOrEqual(6);
    expect(() =>
      v5.run(
        `INSERT INTO attempt (attempt_type, content_id, status, started_at)
         VALUES ('practice', 'x', 'in_progress', '2026-07-13T10:00:00.000Z')`,
      ),
    ).not.toThrow();
  });

  it('R4: a db claiming version 6 whose attempt CHECK lacks practice throws loudly', () => {
    const tampered = buildV5Db();
    tampered.exec('PRAGMA user_version = 6');
    expect(() => migrate(tampered)).toThrow(/practice|V6/);
  });

  it('is idempotent', () => {
    expect(() => migrate(db)).not.toThrow();
    expect(
      db.get<{ user_version: number }>('PRAGMA user_version')!.user_version,
    ).toBeGreaterThanOrEqual(6);
  });
});
