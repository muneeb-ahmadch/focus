// @vitest-environment jsdom
// vB.4: a mission checkpoint may curate bankRef questions that resolve BANK-WIDE by concept,
// cross-topic (locked decision P0-1) against the bundled bank — never baked into the tracked
// pack. Pass rule 4/5, 5/5 = mastered (perfect XP bonus), ≤3/5 fail → targeted rehab of the
// MISSED concepts (not a full mission replay), persisted via best_checkpoint_score.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';
import { getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { createProfile } from '@/db/repo/profile';
import { getMissionState } from '@/db/repo/missions';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { getBankQuestionByConcept, getMockPool } from '@/lib/mockPool';
import { PlayerScreen } from '@/components/player/PlayerScreen';
import { usePlayerStore, type PlayerCard } from '@/stores/playerStore';
import type { Mission } from '@focus/shared';
import { playToEnd, playUntil, type PlayPlan } from '../v2/driver';

const SYNTH_ID = 'r1-m9';

const h = vi.hoisted(() => ({
  db: null as unknown,
  today: '2026-07-06',
  mission: null as unknown,
  replace: null as unknown as (arg: unknown) => void, // set to a vi.fn() in beforeEach
}));

vi.mock('@/db', () => ({ getDb: () => h.db as Db, initDb: async () => h.db as Db }));
vi.mock('expo-router', () => ({
  router: { replace: (arg: unknown) => h.replace(arg), back: () => {}, push: () => {} },
}));
vi.mock('@/notifications/scheduler', () => ({ rescheduleAll: async () => {} }));
vi.mock('@/lib/speech', () => ({
  speak: () => {},
  stopSpeech: () => {},
  initNarrationVoice: async () => {},
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/clock', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/clock')>();
  return { ...real, todayLocal: () => h.today, now: () => real.localDayToDate(h.today) };
});
// Inject a synthetic mission for SYNTH_ID; every other content lookup stays real.
vi.mock('@/content', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/content')>();
  return {
    ...real,
    getMission: (id: string) => (id === SYNTH_ID ? (h.mission as Mission) : real.getMission(id)),
  };
});

let db: Db;
let concepts: string[];

// Pick five DISTINCT bank concepts round-robin across routes, so the checkpoint's refs span
// multiple topics/routes — proving resolution is bank-wide + cross-topic, not topic-scoped.
function pickBankRefConcepts(n: number): string[] {
  const pool = getMockPool();
  const byRoute = new Map<string, string[]>();
  for (const [, q] of pool.questionById) {
    if (q.video) continue;
    if (!q.options.every((o) => o.text)) continue; // want text options for the driver/UI
    const list = byRoute.get(q.routeId) ?? [];
    list.push(q.conceptId);
    byRoute.set(q.routeId, list);
  }
  const routes = [...byRoute.keys()].sort();
  const picked: string[] = [];
  for (let r = 0; picked.length < n && r < 1000; r++) {
    const c = byRoute.get(routes[r % routes.length]!)!.shift();
    if (c && !picked.includes(c)) picked.push(c);
  }
  if (picked.length < n) throw new Error('bank fixture too small to pick cross-route concepts');
  return picked;
}

function buildSynthMission(refs: string[]): Mission {
  const steps = refs.map((c, i) => ({
    id: `synth-s${i + 1}`,
    conceptId: c,
    sourceRef: 'HC-1',
    type: 'rule_card' as const,
    title: `Teach ${i + 1}`,
    body: `Body for concept ${i + 1}.`,
    question: {
      prompt: `Teach prompt ${i + 1}`,
      options: [
        { id: 'a', text: `Teach right ${i + 1}`, correct: true },
        { id: 'b', text: `Teach wrong ${i + 1}`, correct: false },
      ],
      explanation: `Teach explanation ${i + 1}.`,
    },
  }));
  const checkpoint = {
    id: 'synth-cp',
    conceptId: 'c.synth.cp',
    sourceRef: 'HC-1',
    type: 'checkpoint' as const,
    questions: refs.map((bankRef) => ({ bankRef })),
  };
  return {
    missionId: SYNTH_ID,
    routeId: 'route-1',
    title: 'Synth checkpoint',
    estimatedMinutes: 6,
    reviewStatus: 'draft',
    steps: [...steps, checkpoint],
  } as unknown as Mission;
}

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  syncRoutesFromContent(db, getRouteManifest());
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
  h.db = db;
  h.today = '2026-07-06';
  h.replace = vi.fn();
  concepts = pickBankRefConcepts(5);
  h.mission = buildSynthMission(concepts);
  usePlayerStore.getState().abandon();
});

afterEach(cleanup);

// A plan that plays every teaching step correct and answers the checkpoint per `checkpoint`.
function planWith(checkpoint: (n: number) => boolean): PlayPlan {
  let cpSeen = 0;
  return {
    correct(card) {
      if (card.kind === 'checkpoint-q') return checkpoint(cpSeen++);
      return true;
    },
  };
}

function walkToFirstCheckpoint(): void {
  playUntil(usePlayerStore, planWith(() => true), (s) => {
    const st = usePlayerStore.getState();
    return s.phase === 'card' && st.queue[st.index]?.kind === 'checkpoint-q';
  });
}

describe('checkpoint bankRef — resolves bank-wide through the real player', () => {
  it('checkpoint cards are the resolved bank questions for cross-topic refs', () => {
    usePlayerStore.getState().startMission(SYNTH_ID);
    walkToFirstCheckpoint();

    const cpCards = usePlayerStore
      .getState()
      .queue.filter((c): c is Extract<PlayerCard, { kind: 'checkpoint-q' }> => c.kind === 'checkpoint-q');
    expect(cpCards).toHaveLength(5);

    // The refs span more than one route → genuinely cross-topic.
    const routesTouched = new Set(concepts.map((c) => getBankQuestionByConcept(c)!.routeId));
    expect(routesTouched.size).toBeGreaterThan(1);

    for (let i = 0; i < 5; i++) {
      const resolved = getBankQuestionByConcept(concepts[i]!)!;
      expect(cpCards[i]!.conceptId).toBe(concepts[i]);
      expect(cpCards[i]!.question.prompt).toBe(resolved.prompt);
      expect(cpCards[i]!.question.options.map((o) => o.text)).toEqual(
        resolved.options.map((o) => o.text),
      );
    }
  });

  it('a resolved bank option renders and grades through the checkpoint UI', () => {
    usePlayerStore.getState().startMission(SYNTH_ID);
    walkToFirstCheckpoint();

    render(<PlayerScreen />);

    const card = usePlayerStore.getState().queue[usePlayerStore.getState().index];
    if (card?.kind !== 'checkpoint-q') throw new Error('expected a checkpoint card');
    const correct = card.question.options.find((o) => o.correct)!;
    screen.getByText(correct.text!);
    fireEvent.click(screen.getByText(correct.text!));
    expect(usePlayerStore.getState().lastAnswer?.correct).toBe(true);
  });
});

describe('checkpoint bankRef — pass-threshold table', () => {
  it('4/5 passes (not mastered): best_checkpoint_score 0.8, base XP only', () => {
    usePlayerStore.getState().startMission(SYNTH_ID);
    playToEnd(usePlayerStore, planWith((n) => n !== 4)); // miss the 5th

    expect(usePlayerStore.getState().active).toBe(false);
    expect(getMissionState(db, SYNTH_ID)).toMatchObject({
      status: 'completed',
      best_checkpoint_score: 0.8,
    });
    const params = (h.replace as Mock).mock.calls.at(-1)![0].params;
    expect(params.score).toBe('0.8');
    expect(params.xp).toBe('50'); // no perfect bonus
  });

  it('5/5 is mastered: best_checkpoint_score 1.0, perfect XP bonus', () => {
    usePlayerStore.getState().startMission(SYNTH_ID);
    playToEnd(usePlayerStore, planWith(() => true));

    expect(getMissionState(db, SYNTH_ID)).toMatchObject({
      status: 'completed',
      best_checkpoint_score: 1,
    });
    const params = (h.replace as Mock).mock.calls.at(-1)![0].params;
    expect(params.score).toBe('1');
    expect(params.xp).toBe('60'); // base 50 + perfect 10
  });

  it('≤3/5 fails → targeted rehab of the MISSED bank concepts, not a mission replay', () => {
    // Correct on refs 0,1; wrong on 2,3,4 → 2/5 = 0.4.
    usePlayerStore.getState().startMission(SYNTH_ID);
    playUntil(
      usePlayerStore,
      planWith((n) => n < 2),
      (s) => s.inRepair,
    );

    const s = usePlayerStore.getState();
    expect(s.inRepair).toBe(true);
    expect(s.originalCheckpointScore).toBe(0.4);
    expect(s.phase).toBe('repair-intro');

    // The missed concepts are read straight off the checkpoint's (bankRef) cards.
    const missed = concepts.slice(2);
    expect([...s.missedConcepts].sort()).toEqual([...missed].sort());

    // Targeted: every repair card is one of the 5 checkpoint concepts, and the two concepts
    // answered correctly are NOT re-taught (this is rehab of the miss, not a full replay).
    const cpConcepts = new Set(concepts);
    for (const card of s.queue) expect(cpConcepts.has(card.conceptId)).toBe(true);
    const repairConcepts = new Set(s.queue.map((c) => c.conceptId));
    expect(repairConcepts.has(concepts[0]!)).toBe(false);
    expect(repairConcepts.has(concepts[1]!)).toBe(false);
    expect(repairConcepts.has(concepts[2]!)).toBe(true);

    // Not yet completed — best_checkpoint_score only lands on pass or on a failed re-quiz.
    expect(getMissionState(db, SYNTH_ID)?.status).toBe('in_progress');
  });
});
