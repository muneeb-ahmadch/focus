export type SqlParam = string | number | null;
export interface Db {
  run(sql: string, params?: SqlParam[]): void;
  get<T>(sql: string, params?: SqlParam[]): T | undefined;
  all<T>(sql: string, params?: SqlParam[]): T[];
  exec(sql: string): void;                 // multi-statement, no params (migrations, PRAGMA)
  transaction<T>(fn: () => T): T;
}
