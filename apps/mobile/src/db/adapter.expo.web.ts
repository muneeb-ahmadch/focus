import initSqlJs from "sql.js/dist/sql-wasm-browser.js";
import type { Database } from "sql.js/dist/sql-wasm-browser.js";
import type { Db, SqlParam } from "./adapter";

const STORAGE_KEY = "focus.db.b64";

let db: Database | null = null;
let persistScheduled = false;

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function schedulePersist(d: Database): void {
  if (persistScheduled) return;
  persistScheduled = true;
  setTimeout(() => {
    persistScheduled = false;
    localStorage.setItem(STORAGE_KEY, bytesToBase64(d.export()));
  }, 0);
}

export async function preloadDb(): Promise<void> {
  if (db) return;
  const SQL = await initSqlJs({ locateFile: (file) => `/${file}` });
  const saved = localStorage.getItem(STORAGE_KEY);
  db = saved ? new SQL.Database(base64ToBytes(saved)) : new SQL.Database();
}

export function openExpoDb(): Db {
  if (!db) throw new Error("preloadDb() must resolve before openExpoDb() on web");
  const d = db;
  return {
    run(sql: string, params: SqlParam[] = []): void {
      d.run(sql, params);
      schedulePersist(d);
    },
    get<T>(sql: string, params: SqlParam[] = []): T | undefined {
      const stmt = d.prepare(sql);
      try {
        stmt.bind(params);
        return stmt.step() ? (stmt.getAsObject() as T) : undefined;
      } finally {
        stmt.free();
      }
    },
    all<T>(sql: string, params: SqlParam[] = []): T[] {
      const stmt = d.prepare(sql);
      const rows: T[] = [];
      try {
        stmt.bind(params);
        while (stmt.step()) rows.push(stmt.getAsObject() as T);
      } finally {
        stmt.free();
      }
      return rows;
    },
    exec(sql: string): void {
      d.exec(sql);
      schedulePersist(d);
    },
    transaction<T>(fn: () => T): T {
      d.exec("BEGIN");
      try {
        const result = fn();
        d.exec("COMMIT");
        schedulePersist(d);
        return result;
      } catch (e) {
        d.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
