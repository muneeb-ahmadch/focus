// @vitest-environment jsdom
// Slice v5 gate: concept-level Mistake Rehab ladder — easy recall first, then
// the scenario question, then the confidence check on the final answer.
// Clearing requires every answer correct AND the final answer confirmed
// "I was sure" (spec anchor: correct-with-confidence). Anything less leaves
// the item active; a wrong answer ends the ladder and adds a lapse.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import {
  checkpointConceptId,
  MISSIONS,
  getRouteManifest,
  pickDrillQuestion,
  pickScenarioQuestion,
} from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { createProfile } from '@/db/repo/profile';
import { getAllReviewItems, upsertMiss } from '@/db/repo/reviews';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { todayLocal } from '@/lib/clock';
import { PlayerScreen } from '@/components/player/PlayerScreen';
import { useSettingsStore } from '@/stores/settingsStore';
import { usePlayerStore } from '@/stores/playerStore';

const h = vi.hoisted(() => ({ db: null as unknown }));

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

const TODAY = () => todayLocal();

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  syncRoutesFromContent(db, getRouteManifest());
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
  h.db = db;
  useSettingsStore.getState().hydrate();
  usePlayerStore.getState().abandon();
});

afterEach(cleanup);

function ladderConcept(): string {
  for (const mission of MISSIONS) {
    for (const step of mission.steps) {
      if (step.type !== 'scene_decision' && step.type !== 'hazard_cue') continue;
      const hasCheckpointQ = MISSIONS.some((m) =>
        m.steps.some(
          (s) =>
            s.type === 'checkpoint' &&
            s.questions.some((q) => checkpointConceptId(q) === step.conceptId),
        ),
      );
      if (hasCheckpointQ) return step.conceptId;
    }
  }
  throw new Error('content has no concept with both a checkpoint question and a scenario step');
}

function itemFor(conceptId: string) {
  return getAllReviewItems(db).find((r) => r.concept_id === conceptId);
}

function answerCurrent(correct: boolean): void {
  const s = usePlayerStore.getState();
  const card = s.queue[s.index];
  if (!card || card.kind === 'step') throw new Error('expected a question card in rehab');
  const option = card.question.options.find((o) => o.correct === correct);
  if (!option) throw new Error(`no ${correct ? 'correct' : 'wrong'} option`);
  usePlayerStore.getState().answer(option.id);
}

describe('rehab ladder (store)', () => {
  it('queue is recall then scenario, drawn from the concept', () => {
    const concept = ladderConcept();
    upsertMiss(db, concept, 'wrong', TODAY());
    usePlayerStore.getState().startRehab(concept);

    const s = usePlayerStore.getState();
    expect(s.mode).toBe('rehab');
    expect(s.active).toBe(true);
    expect(s.queue.length).toBe(2);
    expect(s.queue.every((c) => c.conceptId === concept)).toBe(true);

    const recall = pickDrillQuestion(concept);
    const scenario = pickScenarioQuestion(concept);
    expect(recall).toBeDefined();
    expect(scenario).toBeDefined();
    const first = s.queue[0]!;
    const second = s.queue[1]!;
    if (first.kind === 'step' || second.kind === 'step') throw new Error('rehab cards are questions');
    expect(first.question.prompt).toBe(recall!.question.prompt);
    expect(second.question.prompt).toBe(scenario!.question.prompt);
  });

  it('all correct + final "sure" → item cleared', () => {
    const concept = ladderConcept();
    upsertMiss(db, concept, 'wrong', TODAY());
    usePlayerStore.getState().startRehab(concept);

    answerCurrent(true);
    usePlayerStore.getState().confirmConfidence('sure');
    answerCurrent(true);
    usePlayerStore.getState().confirmConfidence('sure');

    expect(usePlayerStore.getState().phase).toBe('rehab-summary');
    expect(usePlayerStore.getState().rehabCleared).toBe(true);
    expect(itemFor(concept)?.status).toBe('cleared');
  });

  it('all correct but final "unsure" → item stays active, no lapse added', () => {
    const concept = ladderConcept();
    upsertMiss(db, concept, 'wrong', TODAY());
    const lapsesBefore = itemFor(concept)!.lapses;
    usePlayerStore.getState().startRehab(concept);

    answerCurrent(true);
    usePlayerStore.getState().confirmConfidence('sure');
    answerCurrent(true);
    usePlayerStore.getState().confirmConfidence('unsure');

    expect(usePlayerStore.getState().phase).toBe('rehab-summary');
    expect(usePlayerStore.getState().rehabCleared).toBe(false);
    const item = itemFor(concept)!;
    expect(item.status).toBe('active');
    expect(item.lapses).toBe(lapsesBefore);
  });

  it('wrong answer ends the ladder: item active, lapse added, interval reset', () => {
    const concept = ladderConcept();
    upsertMiss(db, concept, 'wrong', TODAY());
    const lapsesBefore = itemFor(concept)!.lapses;
    usePlayerStore.getState().startRehab(concept);

    answerCurrent(false);
    usePlayerStore.getState().advance();

    expect(usePlayerStore.getState().phase).toBe('rehab-summary');
    expect(usePlayerStore.getState().rehabCleared).toBe(false);
    const item = itemFor(concept)!;
    expect(item.status).toBe('active');
    expect(item.lapses).toBe(lapsesBefore + 1);
    expect(item.interval_days).toBe(1);
  });

  it('rehab for a concept with no available question does not activate a broken session', () => {
    upsertMiss(db, 'ghost-concept', 'wrong', TODAY());
    usePlayerStore.getState().startRehab('ghost-concept');
    const s = usePlayerStore.getState();
    expect(s.active && s.queue.length === 0, 'no empty active rehab queue').toBe(false);
  });
});

describe('rehab ladder (render walk — R5)', () => {
  it('walks both cards through the real UI to a cleared summary', () => {
    const concept = ladderConcept();
    upsertMiss(db, concept, 'wrong', TODAY());
    usePlayerStore.getState().startRehab(concept);
    render(<PlayerScreen />);

    for (let stage = 0; stage < 2; stage++) {
      const s = usePlayerStore.getState();
      const card = s.queue[s.index];
      if (!card || card.kind === 'step') throw new Error('expected question card');
      const correct = card.question.options.find((o) => o.correct)!;
      fireEvent.click(screen.getByText(correct.text!));
      fireEvent.click(screen.getByRole('button', { name: 'I was sure' }));
    }

    expect(usePlayerStore.getState().phase).toBe('rehab-summary');
    expect(screen.getByText(/out of your review queue/i)).toBeTruthy();
    expect(itemFor(concept)?.status).toBe('cleared');
  });

  it('a failed ladder summary says the item stays in the queue', () => {
    const concept = ladderConcept();
    upsertMiss(db, concept, 'wrong', TODAY());
    usePlayerStore.getState().startRehab(concept);
    render(<PlayerScreen />);

    const s = usePlayerStore.getState();
    const card = s.queue[s.index];
    if (!card || card.kind === 'step') throw new Error('expected question card');
    const wrong = card.question.options.find((o) => !o.correct)!;
    fireEvent.click(screen.getByText(wrong.text!));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(usePlayerStore.getState().phase).toBe('rehab-summary');
    expect(screen.getByText(/stays in your queue/i)).toBeTruthy();
  });
});
