export const MOCK_TOTAL = 50;
export const MOCK_PASS_MARK = 43;
export const MOCK_VIDEO_COUNT = 3;
export const MOCK_DURATION_MS = 3_420_000;

export interface MockPoolQuestion { id: string; routeId: string; video: boolean; sign: boolean }
export interface Blueprint {
  total: number;
  videoCount: number;
  minSigns: number;
  // Optional per-route soft minimums for the non-video questions, so a paper's topic
  // spread mirrors the bank instead of a lucky draw. Best-effort: a route short of its
  // quota contributes all it has and the deficit fills elsewhere — never a throw.
  routeQuota?: Record<string, number>;
}
export interface MockHistoryAttempt { questionIds: readonly string[]; startedAt: number }
export interface MockPaper { questionIds: string[]; videoQuestionIds: string[]; exclusionWindow: number }

export function exclusionWindow(poolSize: number): number {
  return Math.max(0, Math.min(3, Math.floor((poolSize - 50) / 50)));
}

// Distribute a non-video question budget across routes by their share of the non-video
// pool (floor). The remainder (from flooring) is filled at random by generateMock, so the
// paper always reaches `total`. Video questions never count toward a route's share.
export function routeQuotaFromShares(
  pool: readonly MockPoolQuestion[],
  budget: number,
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const q of pool) if (!q.video) counts.set(q.routeId, (counts.get(q.routeId) ?? 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const quota: Record<string, number> = {};
  if (total === 0) return quota;
  for (const [routeId, count] of counts) quota[routeId] = Math.floor((count / total) * budget);
  return quota;
}

export function mockRemainingMs(startedAt: number, now: number, durationMs = MOCK_DURATION_MS): number {
  // clamped both ends: a backward clock jump must never grant extra time
  return Math.min(durationMs, Math.max(0, startedAt + durationMs - now));
}

export function scoreMock(correct: number): { correct: number; passed: boolean } {
  return { correct, passed: correct >= MOCK_PASS_MARK };
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

function excludedIds(history: readonly MockHistoryAttempt[], window: number): Set<string> {
  const ids = new Set<string>();
  for (let i = Math.max(0, history.length - window); i < history.length; i++) {
    for (const id of history[i]!.questionIds) ids.add(id);
  }
  return ids;
}

function shortfall(eligible: readonly MockPoolQuestion[], bp: Blueprint): string | null {
  const videos = eligible.filter((q) => q.video).length;
  const signs = eligible.filter((q) => q.sign && !q.video).length;
  const nonVideo = eligible.length - videos;
  if (videos < bp.videoCount) return `video questions (need ${bp.videoCount}, have ${videos})`;
  if (signs < bp.minSigns) return `sign questions (need ${bp.minSigns}, have ${signs})`;
  if (nonVideo < bp.total - bp.videoCount) return `questions (need ${bp.total}, have ${eligible.length})`;
  return null;
}

export function generateMock(
  pool: readonly MockPoolQuestion[],
  history: readonly MockHistoryAttempt[],
  bp: Blueprint,
  rng: () => number,
): MockPaper {
  let window = exclusionWindow(pool.length);
  let eligible: MockPoolQuestion[] = [];
  let miss: string | null = null;
  for (;;) {
    const excluded = excludedIds(history, window);
    eligible = pool.filter((q) => !excluded.has(q.id));
    miss = shortfall(eligible, bp);
    if (!miss || window === 0) break;
    window--;
  }
  if (miss) throw new Error(`mock blueprint unfillable at window 0: not enough ${miss}`);

  const videos = shuffle(rng, eligible.filter((q) => q.video)).slice(0, bp.videoCount);

  // Reserve the non-video questions in priority order — signs floor, then per-route soft
  // quotas, then random fill — capped at the non-video budget so the paper is exactly
  // `total`. Each reservation adds min(want, available), so a short route never throws.
  const budget = bp.total - bp.videoCount;
  const nonVideo = shuffle(rng, eligible.filter((q) => !q.video));
  const selected = new Map<string, MockPoolQuestion>();
  const reserve = (want: number, matches: (q: MockPoolQuestion) => boolean): void => {
    let have = [...selected.values()].filter(matches).length;
    for (const q of nonVideo) {
      if (have >= want || selected.size >= budget) break;
      if (matches(q) && !selected.has(q.id)) {
        selected.set(q.id, q);
        have += 1;
      }
    }
  };

  reserve(bp.minSigns, (q) => q.sign);
  for (const [routeId, want] of Object.entries(bp.routeQuota ?? {})) {
    reserve(want, (q) => q.routeId === routeId);
  }
  reserve(budget, () => true);

  const questionIds = shuffle(rng, [...videos, ...selected.values()]).map((q) => q.id);
  return { questionIds, videoQuestionIds: videos.map((q) => q.id), exclusionWindow: window };
}
