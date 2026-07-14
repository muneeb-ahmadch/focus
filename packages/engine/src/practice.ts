import type { Blueprint } from './mock';

export const PRACTICE_MIN_POOL = 5;
export const MINI_MOCK_BLUEPRINT: Blueprint = { total: 10, videoCount: 0, minSigns: 0 };
export const MINI_MOCK_DURATION_MS = 684_000;
export const MINI_MOCK_PASS_MARK = 9;

export interface PracticePoolQuestion {
  id: string;
  conceptId: string;
  routeId: string;
  topic: string;
}

export type PracticeFilter =
  | { kind: 'topic'; topic: string }
  | { kind: 'route'; routeId: string }
  | { kind: 'weak'; conceptIds: readonly string[] };

export function filterPracticePool(
  pool: readonly PracticePoolQuestion[],
  filter: PracticeFilter,
): PracticePoolQuestion[] {
  switch (filter.kind) {
    case 'topic':
      return pool.filter((q) => q.topic === filter.topic);
    case 'route':
      return pool.filter((q) => q.routeId === filter.routeId);
    case 'weak': {
      const ids = new Set(filter.conceptIds);
      return pool.filter((q) => ids.has(q.conceptId));
    }
  }
}

function shuffle<T>(rng: () => number, items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

export function buildPracticeSet(
  pool: readonly PracticePoolQuestion[],
  filter: PracticeFilter,
  length: number,
  rng: () => number,
): string[] | null {
  const filtered = filterPracticePool(pool, filter);
  if (filtered.length < PRACTICE_MIN_POOL) return null;
  return shuffle(rng, filtered)
    .slice(0, Math.min(length, filtered.length))
    .map((q) => q.id);
}
