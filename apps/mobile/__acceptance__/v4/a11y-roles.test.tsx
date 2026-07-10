// @vitest-environment jsdom
// Pins QA v4 finding: interactive controls in the lesson loop must expose
// screen-reader semantics — answer option rows, sequence items, confidence
// chips, and primary buttons all carry an explicit button role.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MISSIONS, getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { createProfile } from '@/db/repo/profile';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { PlayerScreen } from '@/components/player/PlayerScreen';
import { useSettingsStore } from '@/stores/settingsStore';
import { usePlayerStore, type PlayerCard } from '@/stores/playerStore';
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
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
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

afterEach(cleanup);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buttonNamed(text: string) {
  return screen.getByRole('button', { name: new RegExp(escapeRegExp(text)) });
}

function currentCard(): PlayerCard {
  const s = usePlayerStore.getState();
  const card = s.queue[s.index];
  if (!card) throw new Error(`no card at index ${s.index}`);
  return card;
}

function missionWithStep(type: string): string {
  const mission = MISSIONS.find((m) => m.steps.some((s) => s.type === type));
  if (!mission) throw new Error(`no mission in the pack contains a ${type} step`);
  return mission.missionId;
}

describe('screen-reader roles in the lesson loop', () => {
  it('answer option rows are buttons named by their option text', () => {
    usePlayerStore.getState().startMission('r1-m1');
    playUntil(usePlayerStore, allCorrect, () => {
      const s = usePlayerStore.getState();
      const card = s.queue[s.index];
      return s.phase === 'card' && card?.kind === 'step' && card.step.type !== 'sequence';
    });

    render(<PlayerScreen />);
    const card = currentCard();
    if (card.kind !== 'step' || card.step.type === 'sequence' || card.step.type === 'checkpoint') {
      throw new Error('expected a question step');
    }
    for (const option of card.step.question.options) {
      buttonNamed(option.text);
    }
  });

  it('sequence item rows are buttons named by their item text', () => {
    usePlayerStore.getState().startMission(missionWithStep('sequence'));
    playUntil(usePlayerStore, allCorrect, () => {
      const s = usePlayerStore.getState();
      const card = s.queue[s.index];
      return s.phase === 'card' && card?.kind === 'step' && card.step.type === 'sequence';
    });

    render(<PlayerScreen />);
    const card = currentCard();
    if (card.kind !== 'step' || card.step.type !== 'sequence') {
      throw new Error('expected a sequence step');
    }
    for (const item of card.step.items) {
      buttonNamed(item.text);
    }
  });

  it('confidence chips and primary buttons are buttons', () => {
    usePlayerStore.getState().startMission('r1-m1');
    playUntil(usePlayerStore, allCorrect, () => {
      const s = usePlayerStore.getState();
      const card = s.queue[s.index];
      return s.phase === 'card' && card?.kind === 'step' && card.step.type !== 'sequence';
    });

    render(<PlayerScreen />);
    const card = currentCard();
    if (card.kind !== 'step' || card.step.type === 'sequence' || card.step.type === 'checkpoint') {
      throw new Error('expected a question step');
    }
    const correct = card.step.question.options.find((o) => o.correct);
    if (!correct) throw new Error('no correct option');
    fireEvent.click(screen.getByText(correct.text));

    buttonNamed('I was sure');
    buttonNamed('Not sure');
  });
});
