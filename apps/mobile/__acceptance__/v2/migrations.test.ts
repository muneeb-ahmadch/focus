import { describe, expect, it } from 'vitest';
import { getRouteManifest } from '@/content';
import { migrate } from '@/db/migrations';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';

const TABLES = [
  'user_profile',
  'route_state',
  'mission_state',
  'review_item',
  'attempt',
  'answer_event',
  'daily_activity',
  'app_meta',
];

function tableNames(db: ReturnType<typeof openTestDb>): string[] {
  return db
    .all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .map((r) => r.name);
}

describe('migrations', () => {
  it('fresh database lands on user_version 1 with every table', () => {
    const db = openTestDb();
    migrate(db);
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(1);
    const names = tableNames(db);
    for (const t of TABLES) expect(names).toContain(t);
  });

  it('re-running migrate is a no-op, not a crash', () => {
    const db = openTestDb();
    migrate(db);
    const before = tableNames(db).sort();
    expect(() => migrate(db)).not.toThrow();
    expect(() => migrate(db)).not.toThrow();
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(1);
    expect(tableNames(db).sort()).toEqual(before);
  });

  it('user_version ahead of the actual schema fails loudly, never silently', () => {
    const db = openTestDb();
    db.exec('PRAGMA user_version = 1');
    expect(() => migrate(db)).toThrow();
  });

  it('syncRoutesFromContent is idempotent', () => {
    const db = openTestDb();
    migrate(db);
    const manifest = getRouteManifest();
    syncRoutesFromContent(db, manifest);
    syncRoutesFromContent(db, manifest);
    const rows = db.all<{ route_id: string; total_missions: number }>(
      'SELECT route_id, total_missions FROM route_state ORDER BY route_id',
    );
    expect(rows).toHaveLength(manifest.length);
    for (const route of manifest) {
      expect(rows.find((r) => r.route_id === route.routeId)?.total_missions).toBe(
        route.totalMissions,
      );
    }
  });
});
