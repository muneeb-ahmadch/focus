// Slice v9 gate (Muneeb ruling 2026-07-12): sitting a mock counts as an active
// day. Migration V5 adds daily_activity.mocks_completed; mock finalize bumps it
// on BOTH submit paths; getActiveDays and therefore streak/consistency see the
// day. Abandoning a paper credits nothing. The migration is loud (R4) and
// lossless on upgrade.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeStreak } from '@focus/engine';
import type { Db } from '@/db/adapter';
import { migrate, MIGRATIONS } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';
import { getActiveDays } from '@/db/repo/activity';
import { todayLocal } from '@/lib/clock';
import { useMockStore } from '@/stores/mockStore';

const START_MS = 1_780_000_000_000;

const h = vi.hoisted(() => ({ db: null as unknown, nowMs: 0 }));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('@/lib/clock', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/clock')>();
  return {
    ...real,
    now: () => new Date(h.nowMs),
    todayLocal: () => real.toLocalDay(new Date(h.nowMs)),
  };
});

let db: Db;

function mocksCompletedToday(): number {
  return (
    db.get<{ n: number }>(
      'SELECT mocks_completed AS n FROM daily_activity WHERE day = ?',
      [todayLocal()],
    )?.n ?? 0
  );
}

function buildV4Db(): Db {
  const raw = openTestDb();
  raw.exec('PRAGMA foreign_keys = OFF');
  for (const batch of MIGRATIONS.slice(0, 4)) raw.exec(batch);
  raw.exec('PRAGMA user_version = 4');
  return raw;
}

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  h.db = db;
  h.nowMs = START_MS;
  useMockStore.setState(useMockStore.getInitialState());
});

describe('migration V5', () => {
  it('fresh install: daily_activity has mocks_completed, user_version is at least 5', () => {
    const cols = db.all<{ name: string }>('PRAGMA table_info(daily_activity)').map((c) => c.name);
    expect(cols).toContain('mocks_completed');
    // ≥, not =: later slices append migrations; only the head slice pins exactly
    expect(
      db.get<{ user_version: number }>('PRAGMA user_version')!.user_version,
    ).toBeGreaterThanOrEqual(5);
  });

  it('upgrade from V4 preserves existing activity rows and defaults the new column to 0', () => {
    const v4 = buildV4Db();
    v4.run(`INSERT INTO daily_activity (day, missions_completed, xp) VALUES ('2026-01-01', 2, 60)`);
    migrate(v4);
    const row = v4.get<{ missions_completed: number; xp: number; mocks_completed: number }>(
      `SELECT missions_completed, xp, mocks_completed FROM daily_activity WHERE day = '2026-01-01'`,
    );
    expect(row).toEqual({ missions_completed: 2, xp: 60, mocks_completed: 0 });
    expect(
      v4.get<{ user_version: number }>('PRAGMA user_version')!.user_version,
    ).toBeGreaterThanOrEqual(5);
  });

  it('is idempotent: migrating an already-migrated db changes nothing', () => {
    migrate(db);
    const cols = db.all<{ name: string }>('PRAGMA table_info(daily_activity)').map((c) => c.name);
    expect(cols.filter((c) => c === 'mocks_completed')).toHaveLength(1);
  });

  it('R4: a db claiming version 5 without the column throws loudly', () => {
    const tampered = buildV4Db();
    tampered.exec('PRAGMA user_version = 5');
    expect(() => migrate(tampered)).toThrow(/mocks_completed|V5/);
  });
});

describe('mock finalize credits the day', () => {
  it('submitted mock: mocks_completed bumps, the day is active, streak counts it', () => {
    useMockStore.getState().startMock();
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();

    expect(useMockStore.getState().phase).toBe('submitted');
    expect(mocksCompletedToday()).toBe(1);
    const activeDays = getActiveDays(db);
    expect(activeDays).toContain(todayLocal());

    const dayNum = (d: string) => {
      const [y, m, dd] = d.split('-').map(Number);
      return Math.round(Date.UTC(y!, m! - 1, dd!) / 86_400_000);
    };
    expect(computeStreak(activeDays.map(dayNum), dayNum(todayLocal()))).toBe(1);
  });

  it('expired mock (auto_submitted) credits the day too', () => {
    useMockStore.getState().startMock();
    h.nowMs = START_MS + 3_420_000 + 1;
    useMockStore.getState().tick();

    expect(useMockStore.getState().phase).toBe('expired');
    expect(mocksCompletedToday()).toBe(1);
    expect(getActiveDays(db)).toContain(todayLocal());
  });

  it('two mocks in one day: two bumps, still one active day', () => {
    useMockStore.getState().startMock();
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();
    useMockStore.getState().discard();

    useMockStore.getState().startMock();
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();

    expect(mocksCompletedToday()).toBe(2);
    expect(getActiveDays(db).filter((d) => d === todayLocal())).toHaveLength(1);
  });

  it('a discarded (abandoned) paper credits nothing', () => {
    useMockStore.getState().startMock();
    useMockStore.getState().discard();

    expect(mocksCompletedToday()).toBe(0);
    expect(getActiveDays(db)).not.toContain(todayLocal());
  });
});
