// @vitest-environment jsdom
// Slice v4 gate: product rule 8 — an audio affordance on every lesson prompt
// and every answer option, across all 8 step types, driven through the real
// player. Pressing an option's affordance must speak, never answer.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MISSIONS, getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { createProfile } from '@/db/repo/profile';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { cardNarration } from '@/lib/narration';
import { PlayerScreen } from '@/components/player/PlayerScreen';
import { useSettingsStore } from '@/stores/settingsStore';
import { usePlayerStore, type PlayerCard } from '@/stores/playerStore';
import { playUntil, allCorrect } from '../v2/driver';

const h = vi.hoisted(() => ({
  db: null as unknown,
  speak: vi.fn<(text: string) => void>(),
  stopSpeech: vi.fn<() => void>(),
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: () => {}, back: () => {}, push: () => {} },
}));
vi.mock('@/notifications/scheduler', () => ({ rescheduleAll: async () => {} }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('@/lib/speech', () => ({
  speak: h.speak,
  stopSpeech: h.stopSpeech,
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
  h.speak.mockClear();
  h.stopSpeech.mockClear();
  useSettingsStore.getState().hydrate();
  usePlayerStore.getState().abandon();
});

afterEach(cleanup);

const LESSON_TYPES = [
  'rule_card',
  'scene_decision',
  'sign_meaning',
  'contrast',
  'sequence',
  'hazard_cue',
  'misconception',
] as const;

function missionWithStep(type: string): string {
  const mission = MISSIONS.find((m) => m.steps.some((s) => s.type === type));
  if (!mission) throw new Error(`no mission in the pack contains a ${type} step`);
  return mission.missionId;
}

function currentCard(): PlayerCard {
  const s = usePlayerStore.getState();
  const card = s.queue[s.index];
  if (!card) throw new Error(`no card at index ${s.index}`);
  return card;
}

function optionTexts(card: PlayerCard): string[] {
  if (card.kind !== 'step') return card.question.options.map((o) => o.text ?? o.altText ?? '');
  const step = card.step;
  if (step.type === 'sequence') return step.items.map((i) => i.text);
  if (step.type === 'checkpoint') throw new Error('checkpoint card has no options');
  return step.question.options.map((o) => o.text);
}

function pressAllAffordancesAndCollect(): string[] {
  h.speak.mockClear();
  const affordances = screen.getAllByLabelText('Play audio');
  for (const el of affordances) fireEvent.click(el);
  return h.speak.mock.calls.map((c) => c[0]);
}

describe('audio affordance on all 8 step types', () => {
  for (const type of LESSON_TYPES) {
    it(`${type}: prompt and every option are speakable, and speaking never answers`, () => {
      usePlayerStore.getState().startMission(missionWithStep(type));
      playUntil(usePlayerStore, allCorrect, () => {
        const s = usePlayerStore.getState();
        const card = s.queue[s.index];
        return s.phase === 'card' && card?.kind === 'step' && card.step.type === type;
      });

      render(<PlayerScreen />);
      const card = currentCard();
      const indexBefore = usePlayerStore.getState().index;
      const spoken = pressAllAffordancesAndCollect();
      const expected = [cardNarration(card), ...optionTexts(card)];
      expect([...spoken].sort()).toEqual([...expected].sort());

      expect(usePlayerStore.getState().phase).toBe('card');
      expect(usePlayerStore.getState().index).toBe(indexBefore);
    });
  }

  it('checkpoint: each question prompt and its options are speakable without answering', () => {
    usePlayerStore.getState().startMission(missionWithStep('checkpoint'));
    playUntil(usePlayerStore, allCorrect, () => {
      const s = usePlayerStore.getState();
      return s.phase === 'card' && s.queue[s.index]?.kind === 'checkpoint-q';
    });

    render(<PlayerScreen />);
    const card = currentCard();
    const spoken = pressAllAffordancesAndCollect();
    const expected = [cardNarration(card), ...optionTexts(card)];
    expect([...spoken].sort()).toEqual([...expected].sort());
    expect(usePlayerStore.getState().phase).toBe('card');
  });
});
