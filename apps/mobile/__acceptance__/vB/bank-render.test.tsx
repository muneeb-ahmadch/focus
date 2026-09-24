// @vitest-environment jsdom
// vB.3 gate: bank questions render their images (RN Image over the bundled, git-excluded asset
// map — aliased to a synthetic map in tests). Three surfaces: the strict mock runner (stem
// image + image answer options), the practice/drill player (same, through AnswerOptions), and
// an authored sign_meaning step whose optional imageRef renders a real sign over the abstract
// SignShape fallback. Every option stays audible (rule 8): text speaks its text, an image
// option carries its authored altText as the accessible name (and, in the player, an audio
// button that speaks it).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import MockRunnerScreen from '../../app/mock/runner';
import { PlayerScreen } from '@/components/player/PlayerScreen';
import { SignMeaning } from '@/components/player/SignMeaning';
import type { Step } from '@focus/shared';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';
import { BANK } from '@/content/bank';
import { useMockStore, REAL_MOCK_CONFIG } from '@/stores/mockStore';
import { usePlayerStore } from '@/stores/playerStore';

const START_MS = 1_780_000_000_000;

const h = vi.hoisted(() => ({
  db: null as unknown,
  nowMs: 0,
  push: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@/db', () => ({ getDb: () => h.db as Db, initDb: async () => h.db as Db }));
vi.mock('expo-router', () => ({
  router: { replace: h.replace, back: h.back, push: h.push },
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));
vi.mock('@/lib/clock', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/clock')>();
  return {
    ...real,
    now: () => new Date(h.nowMs),
    todayLocal: () => real.toLocalDay(new Date(h.nowMs)),
  };
});
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('expo-speech', () => ({ speak: vi.fn(), stop: vi.fn(), isSpeakingAsync: async () => false }));
vi.mock('@/notifications/scheduler', () => ({
  rescheduleAll: async () => {},
  requestPermissionOnce: async () => {},
}));

// The synthetic bank carries exactly one stem-image question and one image-option question.
const stemQ = BANK.questions.find((q) => q.stemImage)!;
const imageQ = BANK.questions.find((q) => q.options.some((o) => o.imageRef))!;
const correctImageOption = imageQ.options.find((o) => o.correct)!;

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  h.db = db;
  h.nowMs = START_MS;
  h.push.mockClear();
  h.back.mockClear();
  h.replace.mockClear();
  useMockStore.setState(useMockStore.getInitialState());
  usePlayerStore.setState(usePlayerStore.getInitialState());
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function runMockWith(ids: string[]): void {
  useMockStore.setState({
    ...useMockStore.getInitialState(),
    phase: 'running',
    runConfig: REAL_MOCK_CONFIG,
    paper: { questionIds: ids, videoQuestionIds: [], exclusionWindow: 0 },
    startedAt: START_MS,
    index: 0,
    answers: {},
    flags: [],
  });
}

describe('mock runner renders bank images', () => {
  it('a stem-image question shows the situation image above its text options', () => {
    runMockWith([stemQ.item]);
    render(<MockRunnerScreen />);

    screen.getByText(stemQ.prompt);
    // the stem renders as a real image (aliased asset), not a placeholder
    expect(screen.getAllByRole('img', { name: /question image/i }).length).toBeGreaterThan(0);
    // its options are text and answerable
    for (const option of stemQ.options) screen.getByText(option.text!);
  });

  it('an image-option question renders each option as a sign image named by its altText', () => {
    runMockWith([imageQ.item]);
    render(<MockRunnerScreen />);

    screen.getByText(imageQ.prompt);
    for (const option of imageQ.options) {
      // the option is a tappable button and a real image, both named by the authored altText…
      screen.getByRole('button', { name: option.altText! });
      expect(screen.getAllByRole('img', { name: option.altText! }).length).toBeGreaterThan(0);
      // …and the altText is the accessible name, never rendered as visible answer text
      expect(screen.queryByText(option.altText!)).toBeNull();
    }

    fireEvent.click(screen.getByRole('button', { name: correctImageOption.altText! }));
    expect(useMockStore.getState().answers[imageQ.item]).toBe(correctImageOption.id);
  });
});

describe('practice/drill player renders bank images', () => {
  it('a stem-image question in a practice session shows the situation image', () => {
    usePlayerStore.getState().startPractice([stemQ.item], 'topic:road-scene');
    render(<PlayerScreen />);

    screen.getByText(stemQ.prompt);
    expect(screen.getAllByRole('img', { name: /question image/i }).length).toBeGreaterThan(0);
    for (const option of stemQ.options) screen.getByText(option.text!);
  });

  it('an image-option question in a practice session renders images and stays audible', () => {
    usePlayerStore.getState().startPractice([imageQ.item], 'topic:road-sign-pick');
    render(<PlayerScreen />);

    screen.getByText(imageQ.prompt);
    for (const option of imageQ.options) {
      expect(screen.getAllByRole('img', { name: option.altText! }).length).toBeGreaterThan(0);
      expect(screen.queryByText(option.altText!)).toBeNull();
    }
    // rule 8: every option is audible — at least one audio button per option (plus the prompt's)
    expect(screen.getAllByRole('button', { name: /play audio/i }).length).toBeGreaterThanOrEqual(
      imageQ.options.length,
    );

    fireEvent.click(screen.getByRole('button', { name: correctImageOption.altText! }));
    expect(usePlayerStore.getState().phase).toBe('feedback');
    expect(usePlayerStore.getState().lastAnswer?.correct).toBe(true);
  });
});

describe('sign_meaning optional imageRef', () => {
  const baseSign: Extract<Step, { type: 'sign_meaning' }> = {
    id: 'r1-m1-s3',
    type: 'sign_meaning',
    conceptId: 'c.t.charlie',
    sourceRef: 'KYTS-1',
    sign: { shape: 'warning-triangle', label: 'Two-way traffic' },
    question: {
      prompt: 'What does this sign mean?',
      options: [
        { id: 'a', text: 'Two-way traffic ahead', correct: true },
        { id: 'b', text: 'One-way street', correct: false },
      ],
      explanation: 'It warns of two-way traffic ahead.',
    },
  };

  it('renders the real sign image when the step carries an imageRef', () => {
    const step = { ...baseSign, sign: { ...baseSign.sign, imageRef: 'AB2036.gif' } };
    render(
      <SignMeaning step={step} answered={false} onAnswer={() => {}} />,
    );
    expect(screen.getAllByRole('img', { name: /two-way traffic/i }).length).toBeGreaterThan(0);
    screen.getByText('What does this sign mean?');
  });

  it('falls back to the abstract SignShape when there is no imageRef', () => {
    render(<SignMeaning step={baseSign} answered={false} onAnswer={() => {}} />);
    expect(screen.queryByRole('img')).toBeNull();
    screen.getByText('What does this sign mean?');
  });
});
