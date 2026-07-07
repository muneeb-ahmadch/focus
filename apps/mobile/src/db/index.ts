import { getRouteManifest, MISCONCEPTIONS } from '@/content';
import type { Db } from './adapter';
import { openExpoDb, preloadDb } from './adapter.expo';
import { migrate } from './migrations';
import { syncMisconceptionsFromContent } from './repo/misconceptions';
import { syncRoutesFromContent } from './repo/routes';

let db: Db | null = null;

export async function initDb(): Promise<Db> {
  await preloadDb();
  return getDb();
}

export function getDb(): Db {
  if (!db) {
    db = openExpoDb();
    migrate(db);
    syncRoutesFromContent(db, getRouteManifest());
    syncMisconceptionsFromContent(db, MISCONCEPTIONS);
  }
  return db;
}
