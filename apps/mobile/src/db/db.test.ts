import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './adapter';
import { openTestDb } from './testing/adapter.node';
import { migrate } from './migrations';
import { createProfile, getProfile } from './repo/profile';
import { applyGrade, getDue, upsertMiss, type ReviewItem } from './repo/reviews';
import { completeMission, ensureMissionRow, getMissionState } from './repo/missions';
import { bumpActivity, getActiveDays, getActivity } from './repo/activity';

const TODAY = '2026-07-06';

const getItem = (db: Db, conceptId: string) =>
  db.get<ReviewItem>('SELECT * FROM review_item WHERE concept_id = ?', [conceptId]);

describe('db', () => {
  let db: Db;

  beforeEach(() => {
    db = openTestDb();
    migrate(db);
  });

  it('migrate on empty DB sets user_version 1 and creates all 8 tables', () => {
    const version = db.get<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(1);
    const tables = db
      .all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .map((r) => r.name);
    for (const t of [
      'user_profile',
      'route_state',
      'mission_state',
      'review_item',
      'attempt',
      'answer_event',
      'daily_activity',
      'app_meta',
    ]) {
      expect(tables).toContain(t);
    }
  });

  it('migrate run twice is a no-op, version stays 1', () => {
    expect(() => migrate(db)).not.toThrow();
    const version = db.get<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(1);
  });

  it('createProfile → getProfile roundtrip with auto_play_audio defaulting to 1', () => {
    createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
    const profile = getProfile(db);
    expect(profile?.test_date).toBe('2026-08-05');
    expect(profile?.daily_minutes_target).toBe(10);
    expect(profile?.auto_play_audio).toBe(1);
  });

  it('upsertMiss for a new concept inserts interval 1, due tomorrow, 0 lapses, active', () => {
    upsertMiss(db, 'c.speed.nsl-sign', 'wrong', TODAY);
    const item = getItem(db, 'c.speed.nsl-sign');
    expect(item).toMatchObject({
      interval_days: 1,
      due_at: '2026-07-07',
      lapses: 0,
      status: 'active',
    });
  });

  it('upsertMiss for the same concept again bumps lapses, keeps one row', () => {
    upsertMiss(db, 'c.speed.nsl-sign', 'wrong', TODAY);
    upsertMiss(db, 'c.speed.nsl-sign', 'wrong', TODAY);
    const rows = db.all<ReviewItem>('SELECT * FROM review_item');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lapses: 1, interval_days: 1 });
  });

  it("applyGrade 'easy' at interval 1 moves to interval 3, due +3 days", () => {
    upsertMiss(db, 'c.speed.nsl-sign', 'wrong', TODAY);
    applyGrade(db, 'c.speed.nsl-sign', 'easy', TODAY);
    const item = getItem(db, 'c.speed.nsl-sign');
    expect(item).toMatchObject({ interval_days: 3, due_at: '2026-07-09' });
  });

  it("applyGrade 'okay' at interval 30 clears the item", () => {
    upsertMiss(db, 'c.speed.nsl-sign', 'wrong', TODAY);
    db.run('UPDATE review_item SET interval_days = 30 WHERE concept_id = ?', [
      'c.speed.nsl-sign',
    ]);
    applyGrade(db, 'c.speed.nsl-sign', 'okay', TODAY);
    expect(getItem(db, 'c.speed.nsl-sign')?.status).toBe('cleared');
  });

  it('getDue returns only items due today or earlier, never cleared items', () => {
    upsertMiss(db, 'c.due.yesterday', 'wrong', '2026-07-04'); // due 2026-07-05
    upsertMiss(db, 'c.due.today', 'wrong', '2026-07-05'); // due 2026-07-06
    upsertMiss(db, 'c.due.tomorrow', 'wrong', TODAY); // due 2026-07-07
    upsertMiss(db, 'c.cleared', 'wrong', '2026-07-01');
    db.run(`UPDATE review_item SET status = 'cleared' WHERE concept_id = 'c.cleared'`);
    const due = getDue(db, TODAY).map((r) => r.concept_id);
    expect(due).toEqual(['c.due.yesterday', 'c.due.today']);
  });

  it('completeMission keeps the best checkpoint score', () => {
    ensureMissionRow(db, 'r1-m1', 'route-1');
    completeMission(db, 'r1-m1', 0.8);
    completeMission(db, 'r1-m1', 0.6);
    const state = getMissionState(db, 'r1-m1');
    expect(state?.best_checkpoint_score).toBe(0.8);
    expect(state?.status).toBe('completed');
  });

  it('bumpActivity accumulates within a day and getActiveDays dedupes', () => {
    bumpActivity(db, TODAY, 'missions_completed');
    bumpActivity(db, TODAY, 'missions_completed');
    expect(getActivity(db)[0]?.missions_completed).toBe(2);
    expect(getActiveDays(db)).toEqual([TODAY]);
  });
});
