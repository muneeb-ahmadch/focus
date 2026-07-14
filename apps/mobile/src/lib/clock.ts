let dayOffsetDays = 0; // dev-only fake-clock; persists for the JS session

export function __setDayOffset(days: number): void { dayOffsetDays = days; }
export function __getDayOffset(): number { return dayOffsetDays; }

export function now(): Date { return new Date(Date.now() + dayOffsetDays * 86_400_000); }

const pad = (n: number) => String(n).padStart(2, '0');
export function toLocalDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function todayLocal(): string { return toLocalDay(now()); }

export function localDayToDate(day: string, hour = 12, minute = 0): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0); // noon default dodges DST edges
}
export function addDaysLocal(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return toLocalDay(new Date(y, m - 1, d + n, 12));
}
export function fromEpochMs(ms: number): Date { return new Date(ms); }

export function diffDaysLocal(from: string, to: string): number {
  return Math.round((localDayToDate(to).getTime() - localDayToDate(from).getTime()) / 86_400_000);
}

export function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function dayFromNumber(n: number): string {
  const dt = new Date(n * 86_400_000);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function formatHumanDay(isoDay: string): string {
  const [y, m, d] = isoDay.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
