import type { Db } from '../adapter';

export function getMeta(db: Db, key: string): string | undefined {
  return db.get<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [key])?.value;
}

export function setMeta(db: Db, key: string, value: string): void {
  db.run(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}
