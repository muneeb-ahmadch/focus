import { getRouteManifest } from '@/content';
import type { Db } from './adapter';
import { openExpoDb, preloadDb } from './adapter.expo';
import { migrate } from './migrations';
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
  }
  return db;
}
