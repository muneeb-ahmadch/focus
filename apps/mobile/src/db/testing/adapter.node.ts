import Database from 'better-sqlite3';
import type { Db, SqlParam } from '../adapter';

export function openTestDb(): Db {
  const db = new Database(':memory:');
  return {
    run(sql: string, params: SqlParam[] = []): void {
      db.prepare(sql).run(...params);
    },
    get<T>(sql: string, params: SqlParam[] = []): T | undefined {
      return db.prepare(sql).get(...params) as T | undefined;
    },
    all<T>(sql: string, params: SqlParam[] = []): T[] {
      return db.prepare(sql).all(...params) as T[];
    },
    exec(sql: string): void {
      db.exec(sql);
    },
    transaction<T>(fn: () => T): T {
      return db.transaction(fn)();
    },
  };
}
