// @vitest-environment jsdom
// Pins SMOKE_TEST_V2 DEFECT-1: a question card that stays mounted across queue
// advancement must render the CURRENT question's options, and grading must match
// what the user can see. Covers checkpoint (Q1→Q5) and next-day drill (Q1→Q2).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { getMission, getRouteManifest } from '@/content';
import type { Question } from '@focus/shared';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { createProfile } from '@/db/repo/profile';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { PlayerScreen } from '@/components/player/PlayerScreen';
import { usePlayerStore } from '@/stores/playerStore';
import { playToEnd, playUntil, type PlayPlan } from './driver';

const h = vi.hoisted(() => ({ db: null as unknown, today: '2026-07-06' }));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: () => {}, back: () => {}, push: () => {} },
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
  return {
    ...real,
    todayLocal: () => h.today,
    now: () => real.localDayToDate(h.today),
  };
});

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  syncRoutesFromContent(db, getRouteManifest());
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
  h.db = db;
  h.today = '2026-07-06';
  usePlayerStore.getState().abandon();
});

afterEach(cleanup);

function currentQuestionCard(kind: 'checkpoint-q' | 'drill-q') {
  const s = usePlayerStore.getState();
  const card = s.queue[s.index];
  if (!card || card.kind !== kind) {
    throw new Error(`expected ${kind} at index ${s.index}, got ${card?.kind ?? 'none'}`);
  }
  return card;
}

function expectQuestionOnScreen(q: Question, previous?: Question) {
  for (const option of q.options) {
    screen.getByText(option.text);
  }
  if (previous) {
    const stale = previous.options.filter(
      (o) => !q.options.some((n) => n.text === o.text),
    );
    expect(stale.length).toBeGreaterThan(0);
    for (const option of stale) {
      expect(screen.queryByText(option.text)).toBeNull();
    }
  }
}

function answerVisibleCorrectOption(q: Question) {
  const correct = q.options.find((o) => o.correct);
  if (!correct) throw new Error('question has no correct option');
  fireEvent.click(screen.getByText(correct.text));
  const last = usePlayerStore.getState().lastAnswer;
  expect(last?.correct).toBe(true);
}

describe('question cards re-render per question while mounted (DEFECT-1)', () => {
  it('checkpoint Q1→Q5: each question shows its own options and grades the visible label', () => {
    usePlayerStore.getState().startMission('r1-m1');
    playUntil(usePlayerStore, { correct: () => true }, () => {
      const s = usePlayerStore.getState();
      return s.phase === 'card' && s.queue[s.index]?.kind === 'checkpoint-q';
    });

    render(<PlayerScreen />);

    let previous: Question | undefined;
    for (let i = 0; i < 5; i++) {
      const card = currentQuestionCard('checkpoint-q');
      const q = card.question;
      expectQuestionOnScreen(q, previous);
      answerVisibleCorrectOption(q);
      fireEvent.click(screen.getByText('I was sure'));
      previous = q;
    }

    expect(usePlayerStore.getState().active).toBe(false);
  });

  it('drill Q1→Q2: second review question shows its own options', () => {
    const mission = getMission('r1-m1');
    const checkpoint = mission?.steps.find((s) => s.type === 'checkpoint');
    if (checkpoint?.type !== 'checkpoint') throw new Error('r1-m1 has no checkpoint');
    const drillable = new Set(checkpoint.questions.map((q) => q.conceptId));

    let unsureConcept: string | undefined;
    let wrongConcept: string | undefined;
    const plan: PlayPlan = {
      correct(card) {
        if (
          card.kind === 'checkpoint-q' &&
          wrongConcept === undefined &&
          card.conceptId !== unsureConcept
        ) {
          wrongConcept = card.conceptId;
          return false;
        }
        return true;
      },
      confidence(card) {
        if (card.kind === 'step' && unsureConcept === undefined && drillable.has(card.conceptId)) {
          unsureConcept = card.conceptId;
          return 'unsure';
        }
        return 'sure';
      },
    };
    usePlayerStore.getState().startMission('r1-m1');
    playToEnd(usePlayerStore, plan);
    expect(usePlayerStore.getState().active).toBe(false);

    h.today = '2026-07-07';
    usePlayerStore.getState().startDrill();
    expect(usePlayerStore.getState().queue).toHaveLength(2);

    render(<PlayerScreen />);

    const first = currentQuestionCard('drill-q');
    expectQuestionOnScreen(first.question);
    answerVisibleCorrectOption(first.question);
    fireEvent.click(screen.getByText('Easy'));

    const second = currentQuestionCard('drill-q');
    expect(second.conceptId).not.toBe(first.conceptId);
    expectQuestionOnScreen(second.question, first.question);
  });
});
