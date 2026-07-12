export const MOCK_TOTAL = 50;
export const MOCK_PASS_MARK = 43;
export const MOCK_VIDEO_COUNT = 3;
export const MOCK_DURATION_MS = 3_420_000;

export interface MockPoolQuestion { id: string; routeId: string; video: boolean; sign: boolean }
export interface Blueprint { total: number; videoCount: number; minSigns: number }
export interface MockHistoryAttempt { questionIds: readonly string[]; startedAt: number }
export interface MockPaper { questionIds: string[]; videoQuestionIds: string[]; exclusionWindow: number }

export function exclusionWindow(poolSize: number): number {
  return Math.max(0, Math.min(3, Math.floor((poolSize - 50) / 50)));
}

export function mockRemainingMs(startedAt: number, now: number): number {
  // clamped both ends: a backward clock jump must never grant extra time
  return Math.min(MOCK_DURATION_MS, Math.max(0, startedAt + MOCK_DURATION_MS - now));
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
  const chosenSigns = shuffle(rng, eligible.filter((q) => q.sign && !q.video)).slice(0, bp.minSigns);
  const signIds = new Set(chosenSigns.map((q) => q.id));
  const fillers = shuffle(rng, eligible.filter((q) => !q.video && !signIds.has(q.id)))
    .slice(0, bp.total - bp.videoCount - bp.minSigns);

  const questionIds = shuffle(rng, [...videos, ...chosenSigns, ...fillers]).map((q) => q.id);
  return { questionIds, videoQuestionIds: videos.map((q) => q.id), exclusionWindow: window };
}
