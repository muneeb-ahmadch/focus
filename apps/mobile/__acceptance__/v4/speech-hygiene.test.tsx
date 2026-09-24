// @vitest-environment jsdom
// Slice v4 gate: TTS hygiene through the real speech lib against a mocked
// expo-speech — every utterance is preceded by a stop (no overlapping TTS),
// answering and unmounting stop speech, and auto_play_audio=0 silences
// card entry without disabling the manual affordance.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { createProfile } from '@/db/repo/profile';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { cardNarration } from '@/lib/narration';
import { PlayerScreen } from '@/components/player/PlayerScreen';
import { useSettingsStore } from '@/stores/settingsStore';
import { usePlayerStore, type PlayerCard } from '@/stores/playerStore';

const h = vi.hoisted(() => ({
  db: null as unknown,
  speak: vi.fn<(text: string, opts?: unknown) => void>(),
  stop: vi.fn<() => void>(),
}));

vi.mock('expo-speech', () => ({
  speak: h.speak,
  stop: h.stop,
  getAvailableVoicesAsync: async () => [],
  VoiceQuality: { Enhanced: 'Enhanced' },
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
  h.stop.mockClear();
  usePlayerStore.getState().abandon();
});

afterEach(cleanup);

function currentCard(): PlayerCard {
  const s = usePlayerStore.getState();
  const card = s.queue[s.index];
  if (!card) throw new Error(`no card at index ${s.index}`);
  return card;
}

function correctOptionText(card: PlayerCard): string {
  if (card.kind !== 'step') {
    const o = card.question.options.find((opt) => opt.correct);
    if (!o) throw new Error('no correct option');
    return o.text ?? o.altText ?? '';
  }
  const step = card.step;
  if (step.type === 'sequence' || step.type === 'checkpoint') {
    throw new Error(`cannot click a single option on ${step.type}`);
  }
  const o = step.question.options.find((opt) => opt.correct);
  if (!o) throw new Error('no correct option');
  return o.text;
}

describe('speech hygiene with auto-play on', () => {
  it('speaks each card once, always stop-before-speak, and stops on answer and unmount', () => {
    useSettingsStore.getState().hydrate();
    usePlayerStore.getState().startMission('r1-m1');

    const { unmount } = render(<PlayerScreen />);

    const firstCard = currentCard();
    expect(h.speak).toHaveBeenCalledTimes(1);
    expect(h.speak.mock.calls[0][0]).toBe(cardNarration(firstCard));
    const firstSpeakOrder = h.speak.mock.invocationCallOrder[0];
    expect(
      h.stop.mock.invocationCallOrder.some((o) => o < firstSpeakOrder),
      'expo-speech stop() must be called before the first utterance',
    ).toBe(true);

    const stopsBeforeAnswer = h.stop.mock.calls.length;
    fireEvent.click(screen.getByText(correctOptionText(firstCard)));
    expect(
      h.stop.mock.calls.length,
      'answering must stop the in-flight utterance',
    ).toBeGreaterThan(stopsBeforeAnswer);

    fireEvent.click(screen.getByText('I was sure'));
    const secondCard = currentCard();
    expect(h.speak).toHaveBeenCalledTimes(2);
    expect(h.speak.mock.calls[1][0]).toBe(cardNarration(secondCard));
    const secondSpeakOrder = h.speak.mock.invocationCallOrder[1];
    expect(
      h.stop.mock.invocationCallOrder.some(
        (o) => o > firstSpeakOrder && o < secondSpeakOrder,
      ),
      'a stop must land between consecutive utterances',
    ).toBe(true);

    const stopsBeforeUnmount = h.stop.mock.calls.length;
    unmount();
    expect(
      h.stop.mock.calls.length,
      'unmounting the player must stop speech',
    ).toBeGreaterThan(stopsBeforeUnmount);
  });
});

describe('speech with auto-play off', () => {
  it('turning auto-play off mid-card stops the in-flight utterance (QA v4 finding)', () => {
    useSettingsStore.getState().hydrate();
    usePlayerStore.getState().startMission('r1-m1');

    render(<PlayerScreen />);
    expect(h.speak).toHaveBeenCalledTimes(1);

    const stopsBeforeToggle = h.stop.mock.calls.length;
    act(() => useSettingsStore.getState().setSetting('autoPlayAudio', false));
    expect(
      h.stop.mock.calls.length,
      'disabling auto-play must silence the in-flight utterance',
    ).toBeGreaterThan(stopsBeforeToggle);
  });

  it('is silent on card entry but the affordance still speaks', () => {
    db.run(`UPDATE user_profile SET auto_play_audio = 0 WHERE user_id = 'local'`);
    useSettingsStore.getState().hydrate();
    usePlayerStore.getState().startMission('r1-m1');

    render(<PlayerScreen />);
    expect(h.speak).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByLabelText('Play audio')[0]);
    expect(h.speak).toHaveBeenCalledTimes(1);
  });
});
