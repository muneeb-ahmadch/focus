import { getRouteManifest, MISCONCEPTIONS } from '@/content';
import type { Db } from './adapter';
import { migrate } from './migrations';
import { syncMisconceptionsFromContent } from './repo/misconceptions';
import { syncRoutesFromContent } from './repo/routes';

// Wipe the database back to a brand-new install: drop every user table, replay
// the migrations, re-seed the bundled content. The result is byte-identical to
// what getDb() produces on a first launch (empty user tables, seeded route_state
// + misconception, user_version at the head, no install identity). Lives apart
// from db/index.ts so it stays importable without the Expo native adapter.
export function resetDatabase(db: Db): void {
  const tables = db.all<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
  );
  // answer_event references attempt; drop with FK enforcement off (a no-op inside
  // a transaction, so keep it outside — same reason migrate() does), then restore.
  const fk = db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys ?? 0;
  db.exec('PRAGMA foreign_keys = OFF');
  for (const { name } of tables) db.exec(`DROP TABLE IF EXISTS "${name}"`);
  db.exec('PRAGMA user_version = 0');
  db.exec(`PRAGMA foreign_keys = ${fk ? 'ON' : 'OFF'}`);

  migrate(db);
  syncRoutesFromContent(db, getRouteManifest());
  syncMisconceptionsFromContent(db, MISCONCEPTIONS);
}
