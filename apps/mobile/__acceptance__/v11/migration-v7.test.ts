// Slice v11 gate: migration V7 adds the analytics_event outbound queue —
// unsent events only (flush deletes on server ack), event_id is the
// idempotency key. Lossless on upgrade, loud on tamper (R4), idempotent.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/db/adapter';
import { migrate, MIGRATIONS } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';

let db: Db;

function buildV6Db(): Db {
  const raw = openTestDb();
  raw.exec('PRAGMA foreign_keys = OFF');
  for (const batch of MIGRATIONS.slice(0, 6)) raw.exec(batch);
  raw.exec('PRAGMA user_version = 6');
  return raw;
}

beforeEach(() => {
  db = openTestDb();
  migrate(db);
});

describe('migration V7 — analytics_event queue', () => {
  it('fresh install: analytics events insert cleanly, user_version is 7', () => {
    expect(() =>
      db.run(
        `INSERT INTO analytics_event (event_id, name, occurred_at, props_json)
         VALUES ('11111111-1111-4111-8111-111111111111', 'app_open', '2026-07-14T10:00:00.000Z', '{}')`,
      ),
    ).not.toThrow();
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(7);
  });

  it('props_json defaults to the empty object', () => {
    db.run(
      `INSERT INTO analytics_event (event_id, name, occurred_at)
       VALUES ('22222222-2222-4222-8222-222222222222', 'app_open', '2026-07-14T10:00:00.000Z')`,
    );
    const row = db.get<{ props_json: string }>(
      `SELECT props_json FROM analytics_event WHERE event_id = '22222222-2222-4222-8222-222222222222'`,
    );
    expect(row?.props_json).toBe('{}');
  });

  it('event_id is the primary key — a duplicate id is rejected', () => {
    const insert = () =>
      db.run(
        `INSERT INTO analytics_event (event_id, name, occurred_at)
         VALUES ('33333333-3333-4333-8333-333333333333', 'app_open', '2026-07-14T10:00:00.000Z')`,
      );
    insert();
    expect(insert).toThrow();
  });

  it('upgrade from V6 preserves attempts and reviews, adds an empty queue', () => {
    const v6 = buildV6Db();
    v6.run(
      `INSERT INTO attempt (attempt_type, content_id, status, started_at, score)
       VALUES ('practice', 'topic:lights', 'submitted', '2026-07-13T10:00:00.000Z', 0.8)`,
    );
    v6.run(
      `INSERT INTO review_item (concept_id, origin_type, due_at, created_at, updated_at)
       VALUES ('c.lights.night', 'wrong', '2026-07-14', '2026-07-13T10:00:00.000Z', '2026-07-13T10:00:00.000Z')`,
    );
    migrate(v6);
    expect(v6.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(7);
    const attempt = v6.get<{ attempt_type: string; score: number }>(
      'SELECT attempt_type, score FROM attempt',
    );
    expect(attempt).toEqual({ attempt_type: 'practice', score: 0.8 });
    const review = v6.get<{ concept_id: string }>('SELECT concept_id FROM review_item');
    expect(review?.concept_id).toBe('c.lights.night');
    expect(
      v6.get<{ n: number }>('SELECT COUNT(*) AS n FROM analytics_event')?.n,
    ).toBe(0);
  });

  it('R4: a db claiming version 7 without analytics_event throws loudly', () => {
    const tampered = buildV6Db();
    tampered.exec('PRAGMA user_version = 7');
    expect(() => migrate(tampered)).toThrow(/analytics_event/);
  });

  it('is idempotent', () => {
    expect(() => migrate(db)).not.toThrow();
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(7);
  });
});
