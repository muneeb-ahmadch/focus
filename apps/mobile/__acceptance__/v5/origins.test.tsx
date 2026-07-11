// @vitest-environment jsdom
// Slice v5 gate: the two inferred review origins become real. Hint usage
// marks origin hint_heavy EVEN on correct answers (spec anchor); a correct
// answer that took ≥ SLOW_ANSWER_MS marks origin slow. Precedence when
// several signals fire on one card: wrong > hint_heavy > unsure > slow.
// The hint affordance itself is render-tested (R5): it eliminates exactly
// one incorrect option, the eliminated option is inert, and the hint state
// resets on the next card.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { createProfile } from '@/db/repo/profile';
import { getAllReviewItems } from '@/db/repo/reviews';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { PlayerScreen } from '@/components/player/PlayerScreen';
import { useSettingsStore } from '@/stores/settingsStore';
import { usePlayerStore, SLOW_ANSWER_MS, type PlayerCard } from '@/stores/playerStore';
import { playUntil, allCorrect } from '../v2/driver';

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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function atQuestionCard(minOptions = 2) {
  playUntil(usePlayerStore, allCorrect, () => {
    const s = usePlayerStore.getState();
    const card = s.queue[s.index];
    return (
      s.phase === 'card' &&
      card?.kind === 'step' &&
      card.step.type !== 'sequence' &&
      card.step.type !== 'checkpoint' &&
      card.step.question.options.length >= minOptions
    );
  });
}

function currentQuestionCard(): { card: PlayerCard; options: { id: string; text: string; correct: boolean }[] } {
  const s = usePlayerStore.getState();
  const card = s.queue[s.index];
  if (!card || card.kind !== 'step' || card.step.type === 'sequence' || card.step.type === 'checkpoint') {
    throw new Error('expected an MCQ step card');
  }
  return { card, options: card.step.question.options };
}

function originOf(conceptId: string): string | undefined {
  return getAllReviewItems(db).find((r) => r.concept_id === conceptId)?.origin_type;
}

describe('hint affordance (render)', () => {
  it('hint eliminates one incorrect option, the answer still records hint_heavy, and hint state resets on the next card', () => {
    usePlayerStore.getState().startMission('r1-m1');
    atQuestionCard();
    render(<PlayerScreen />);

    const { card } = currentQuestionCard();

    fireEvent.click(screen.getByRole('button', { name: 'Show a hint' }));
    const hintedId = usePlayerStore.getState().hintOptionId;
    expect(hintedId, 'useHint must set hintOptionId').toBeTruthy();
    const { options } = currentQuestionCard();
    const eliminated = options.find((o) => o.id === hintedId);
    expect(eliminated, 'hint must reference a real option').toBeDefined();
    expect(eliminated!.correct, 'hint must never eliminate the correct option').toBe(false);

    const eliminatedButton = screen.getByRole('button', { name: eliminated!.text });
    expect(eliminatedButton.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(eliminatedButton);
    expect(usePlayerStore.getState().phase, 'eliminated option must be inert').toBe('card');

    const correct = options.find((o) => o.correct)!;
    fireEvent.click(screen.getByRole('button', { name: correct.text }));
    fireEvent.click(screen.getByRole('button', { name: 'I was sure' }));

    expect(originOf(card.conceptId), 'correct-with-hint must still enqueue hint_heavy').toBe(
      'hint_heavy',
    );
    expect(usePlayerStore.getState().hintOptionId, 'hint state must reset after the card').toBeUndefined();
  });
});

describe('origin precedence (store)', () => {
  it('wrong beats hint_heavy: a hinted wrong answer records origin wrong', () => {
    usePlayerStore.getState().startMission('r1-m1');
    atQuestionCard(3);
    const { card, options } = currentQuestionCard();

    usePlayerStore.getState().useHint();
    const hinted = usePlayerStore.getState().hintOptionId;
    const wrong = options.find((o) => !o.correct && o.id !== hinted)!;
    usePlayerStore.getState().answer(wrong.id);

    expect(originOf(card.conceptId)).toBe('wrong');
  });

  it('hint_heavy beats unsure: correct + hint + "Not sure" records hint_heavy', () => {
    usePlayerStore.getState().startMission('r1-m1');
    atQuestionCard();
    const { card, options } = currentQuestionCard();

    usePlayerStore.getState().useHint();
    usePlayerStore.getState().answer(options.find((o) => o.correct)!.id);
    usePlayerStore.getState().confirmConfidence('unsure');

    expect(originOf(card.conceptId)).toBe('hint_heavy');
  });

  it('a confident correct answer slower than SLOW_ANSWER_MS records origin slow', () => {
    vi.useFakeTimers({ now: new Date('2026-07-10T12:00:00') });
    usePlayerStore.getState().startMission('r1-m1');
    atQuestionCard();
    const { card, options } = currentQuestionCard();

    vi.setSystemTime(Date.now() + SLOW_ANSWER_MS + 1000);
    usePlayerStore.getState().answer(options.find((o) => o.correct)!.id);
    usePlayerStore.getState().confirmConfidence('sure');

    expect(originOf(card.conceptId)).toBe('slow');
  });

  it('unsure beats slow: a slow unsure answer records origin unsure', () => {
    vi.useFakeTimers({ now: new Date('2026-07-10T12:00:00') });
    usePlayerStore.getState().startMission('r1-m1');
    atQuestionCard();
    const { card, options } = currentQuestionCard();

    vi.setSystemTime(Date.now() + SLOW_ANSWER_MS + 1000);
    usePlayerStore.getState().answer(options.find((o) => o.correct)!.id);
    usePlayerStore.getState().confirmConfidence('unsure');

    expect(originOf(card.conceptId)).toBe('unsure');
  });

  it('a fast confident correct answer records nothing', () => {
    vi.useFakeTimers({ now: new Date('2026-07-10T12:00:00') });
    usePlayerStore.getState().startMission('r1-m1');
    atQuestionCard();
    const { card, options } = currentQuestionCard();

    vi.setSystemTime(Date.now() + 3000);
    usePlayerStore.getState().answer(options.find((o) => o.correct)!.id);
    usePlayerStore.getState().confirmConfidence('sure');

    expect(originOf(card.conceptId)).toBeUndefined();
  });

  it('hint is unavailable on a 2-option question — eliminating the only wrong option gives the answer away (QA v5 note)', () => {
    usePlayerStore.getState().startMission('r1-m1');
    atQuestionCard(3);
    const s = usePlayerStore.getState();
    const card = s.queue[s.index];
    if (!card || card.kind !== 'step' || card.step.type === 'sequence' || card.step.type === 'checkpoint') {
      throw new Error('expected an MCQ step card');
    }
    const q = card.step.question;
    const twoOptions = [q.options.find((o) => o.correct)!, q.options.find((o) => !o.correct)!];
    const trimmedStep = { ...card.step, question: { ...q, options: twoOptions } };
    usePlayerStore.setState({
      queue: s.queue.map((c, i) => (i === s.index ? { ...card, step: trimmedStep } : c)),
    });

    usePlayerStore.getState().useHint();
    expect(usePlayerStore.getState().hintOptionId).toBeUndefined();
  });

  it('hints are unavailable on checkpoint questions', () => {
    usePlayerStore.getState().startMission('r1-m1');
    playUntil(usePlayerStore, allCorrect, () => {
      const s = usePlayerStore.getState();
      return s.phase === 'card' && s.queue[s.index]?.kind === 'checkpoint-q';
    });
    usePlayerStore.getState().useHint();
    expect(usePlayerStore.getState().hintOptionId).toBeUndefined();
  });
});
