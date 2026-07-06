import { openDatabaseSync } from 'expo-sqlite';
import type { Db, SqlParam } from './adapter';

// web counterpart (adapter.expo.web.ts) loads the sql.js wasm here
export async function preloadDb(): Promise<void> {}

export function openExpoDb(name = 'focus.db'): Db {
  const db = openDatabaseSync(name);
  return {
    run(sql: string, params: SqlParam[] = []): void {
      db.runSync(sql, params);
    },
    get<T>(sql: string, params: SqlParam[] = []): T | undefined {
      return db.getFirstSync<T>(sql, params) ?? undefined;
    },
    all<T>(sql: string, params: SqlParam[] = []): T[] {
      return db.getAllSync<T>(sql, params);
    },
    exec(sql: string): void {
      db.execSync(sql);
    },
    transaction<T>(fn: () => T): T {
      let result!: T;
      db.withTransactionSync(() => {
        result = fn();
      });
      return result;
    },
  };
}
