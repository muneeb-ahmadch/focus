// @vitest-environment jsdom
// Slice v11 gate: every funnel moment queues exactly the catalogued event with
// whitelisted, PII-free props — driven through the same entry points the UI
// drives (R2): onboarding screen walk, playerStore mission/drill/rehab/practice
// flows, mockStore real and mini papers. The M1/M2 gate metrics (missions
// completed per install, distinct study days) become measurable from this
// stream alone. bootAnalytics is once-per-session: a re-render never
// double-counts app_open.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMission, getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { getMissionState } from '@/db/repo/missions';
import { getProfile, createProfile } from '@/db/repo/profile';
import { upsertMiss } from '@/db/repo/reviews';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { bootAnalytics } from '@/lib/analytics';
import { getMockPool } from '@/lib/mockPool';
import { getPracticePool } from '@/lib/practicePool';
import { parseResumePayload } from '@/stores/resumePayload';
import { MINI_MOCK_CONFIG, useMockStore } from '@/stores/mockStore';
import { usePlayerStore } from '@/stores/playerStore';
import { allCorrect, playToEnd, playUntil, type PlayPlan } from '../v2/driver';
import OnboardingScreen from '../../app/onboarding';

const h = vi.hoisted(() => ({
  db: null as unknown,
  today: '2026-07-06',
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn() },
  useLocalSearchParams: () => ({}),
}));
vi.mock('@/lib/clock', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/clock')>();
  return {
    ...real,
    todayLocal: () => h.today,
    now: () => real.localDayToDate(h.today),
  };
});
vi.mock('expo-crypto', async () => {
  const { randomUUID } = await import('node:crypto');
  return { randomUUID };
});
vi.mock('@/flags', () => ({ MOCKS_ENABLED: true, ANALYTICS_URL: null }));
vi.mock('@/notifications/scheduler', () => ({
  rescheduleAll: async () => {},
  requestPermissionOnce: async () => {},
}));
vi.mock('expo-speech', () => ({ speak: vi.fn(), stop: vi.fn(), isSpeakingAsync: async () => false }));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: import('react').ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/TestDatePicker', async () => {
  const React = await import('react');
  return {
    TestDatePicker: (p: { onChange: (d: string) => void }) =>
      React.createElement('button', { onClick: () => p.onChange('2026-08-05') }, 'pick-date'),
  };
});

const EVENT_CATALOGUE = new Set([
  'app_open',
  'onboarding_completed',
  'mission_started',
  'mission_completed',
  'checkpoint_failed',
  'drill_completed',
  'rehab_completed',
  'practice_completed',
  'mock_started',
  'mock_completed',
]);

const PROPS_WHITELIST = new Set([
  'mission_id',
  'score',
  'kind',
  'passed',
  'total',
  'correct',
  'cleared',
  'content_id',
]);

interface QueueRow {
  name: string;
  props_json: string;
}

let db: Db;

const events = (name?: string): { name: string; props: Record<string, unknown> }[] =>
  db
    .all<QueueRow>('SELECT name, props_json FROM analytics_event ORDER BY rowid')
    .map((r) => ({ name: r.name, props: JSON.parse(r.props_json) as Record<string, unknown> }))
    .filter((e) => name === undefined || e.name === name);

function seedProfile(): void {
  syncRoutesFromContent(db, getRouteManifest());
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
}

function checkpointConceptOf(missionId: string): string {
  const mission = getMission(missionId);
  const step = mission?.steps.find((s) => s.type === 'checkpoint');
  if (step?.type !== 'checkpoint') throw new Error('mission has no checkpoint');
  return step.questions[0].conceptId;
}

function walkPractice(): void {
  for (let i = 0; i < 100; i++) {
    const s = usePlayerStore.getState();
    if (s.phase === 'practice-summary') return;
    const card = s.queue[s.index];
    if (s.phase === 'card') {
      if (card.kind !== 'drill-q') throw new Error('practice queue must be drill questions');
      const option = card.question.options.find((o) => o.correct);
      if (!option) throw new Error('no correct option');
      s.answer(option.id);
    } else if (s.phase === 'feedback') {
      s.advance();
    } else {
      throw new Error(`unexpected practice phase ${s.phase}`);
    }
  }
  throw new Error('practice session did not finish');
}

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  h.db = db;
  usePlayerStore.setState({ active: false });
  useMockStore.setState({ phase: 'idle' });
});

afterEach(cleanup);

describe('onboarding', () => {
  it('completing onboarding queues onboarding_completed exactly once', () => {
    render(<OnboardingScreen />);
    fireEvent.click(screen.getByText('Get started'));
    fireEvent.click(screen.getByText('pick-date'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('Start'));
    expect(getProfile(db)).toBeDefined();
    expect(events('onboarding_completed')).toHaveLength(1);
  });
});

describe('mission events', () => {
  it('a fresh start queues mission_started; completion queues mission_completed with the score', () => {
    seedProfile();
    usePlayerStore.getState().startMission('r1-m1');
    expect(events('mission_started')).toEqual([
      { name: 'mission_started', props: { mission_id: 'r1-m1' } },
    ]);
    playToEnd(usePlayerStore, allCorrect);
    expect(events('mission_completed')).toEqual([
      { name: 'mission_completed', props: { mission_id: 'r1-m1', score: 1 } },
    ]);
    expect(events('checkpoint_failed')).toHaveLength(0);
  });

  it('resuming a mission does not count as a second start', () => {
    seedProfile();
    usePlayerStore.getState().startMission('r1-m1');
    usePlayerStore.getState().answer(
      (() => {
        const card = usePlayerStore.getState().queue[0];
        if (card.kind !== 'step' || card.step.type === 'sequence' || card.step.type === 'checkpoint')
          throw new Error('expected a question step first');
        return card.step.question.options[0].id;
      })(),
    );
    usePlayerStore.getState().abandon();
    const payload = parseResumePayload(getMissionState(db, 'r1-m1')?.resume_payload_json);
    expect(payload).toBeDefined();
    usePlayerStore.getState().startMission('r1-m1', payload);
    expect(events('mission_started')).toHaveLength(1);
  });

  it('a corrupt resume payload falls through to a fresh start and DOES count as a start', () => {
    seedProfile();
    usePlayerStore.getState().startMission('r1-m1');
    expect(events('mission_started')).toHaveLength(1);
    usePlayerStore.getState().abandon();
    // a resume payload whose queueIds no longer resolve (e.g. a content update
    // between sessions) is not a resume — startMission rebuilds the full queue
    const corrupt = { queueIds: ['does-not-exist-1', 'does-not-exist-2'], index: 0, phase: 'card' as const, answers: [], checkpointAnswers: [], inRepair: false };
    usePlayerStore.getState().startMission('r1-m1', corrupt);
    expect(usePlayerStore.getState().index).toBe(0);
    expect(usePlayerStore.getState().queue.length).toBeGreaterThan(2);
    expect(events('mission_started')).toHaveLength(2);
  });

  it('failing the checkpoint (and its repair retry) queues checkpoint_failed, never mission_completed', () => {
    seedProfile();
    const failCheckpoints: PlayPlan = { correct: (card) => card.kind !== 'checkpoint-q' };
    usePlayerStore.getState().startMission('r1-m1');
    playToEnd(usePlayerStore, failCheckpoints);
    expect(usePlayerStore.getState().phase).toBe('failed');
    const failed = events('checkpoint_failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].props.mission_id).toBe('r1-m1');
    expect(typeof failed[0].props.score).toBe('number');
    expect(events('mission_completed')).toHaveLength(0);
  });
});

describe('drill, rehab, practice events', () => {
  it('finishing a drill queues drill_completed with totals', () => {
    seedProfile();
    const concept = checkpointConceptOf('r1-m1');
    upsertMiss(db, concept, 'wrong', h.today);
    usePlayerStore.getState().startDrill([concept]);
    playToEnd(usePlayerStore, allCorrect);
    const done = events('drill_completed');
    expect(done).toHaveLength(1);
    expect(done[0].props.total).toBe(1);
    expect(done[0].props.correct).toBe(1);
  });

  it('finishing a rehab queues rehab_completed with the outcome', () => {
    seedProfile();
    const concept = checkpointConceptOf('r1-m1');
    upsertMiss(db, concept, 'wrong', h.today);
    usePlayerStore.getState().startRehab(concept);
    playUntil(usePlayerStore, allCorrect, (s) => s.phase === 'rehab-summary');
    expect(events('rehab_completed')).toEqual([
      { name: 'rehab_completed', props: { cleared: true } },
    ]);
  });

  it('finishing a practice session queues practice_completed with the session label', () => {
    seedProfile();
    const ids = getPracticePool()
      .filter((q) => q.topic === 'lights')
      .slice(0, 3)
      .map((q) => q.id);
    usePlayerStore.getState().startPractice(ids, 'topic:lights');
    walkPractice();
    expect(events('practice_completed')).toEqual([
      {
        name: 'practice_completed',
        props: { content_id: 'topic:lights', total: 3, correct: 3 },
      },
    ]);
  });
});

describe('mock events', () => {
  it('a real mock queues mock_started and mock_completed with kind, score, passed', () => {
    seedProfile();
    useMockStore.getState().startMock();
    expect(events('mock_started')).toEqual([
      { name: 'mock_started', props: { kind: 'real' } },
    ]);
    const s = useMockStore.getState();
    const { questionById } = getMockPool();
    for (const qid of s.paper!.questionIds) {
      const correct = questionById.get(qid)!.options.find((o) => o.correct)!;
      useMockStore.getState().answer(qid, correct.id);
    }
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();
    expect(events('mock_completed')).toEqual([
      { name: 'mock_completed', props: { kind: 'real', score: 50, passed: true } },
    ]);
  });

  it('a mini mock is tagged mini in both events', () => {
    seedProfile();
    useMockStore.getState().startMock(MINI_MOCK_CONFIG);
    expect(events('mock_started')).toEqual([
      { name: 'mock_started', props: { kind: 'mini' } },
    ]);
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();
    expect(events('mock_completed')).toEqual([
      { name: 'mock_completed', props: { kind: 'mini', score: 0, passed: false } },
    ]);
  });

  it('discarding a paper queues no mock_completed', () => {
    seedProfile();
    useMockStore.getState().startMock();
    useMockStore.getState().discardDangling();
    expect(events('mock_started')).toHaveLength(1);
    expect(events('mock_completed')).toHaveLength(0);
  });
});

describe('boot', () => {
  it('bootAnalytics queues app_open once per session, even when called twice', () => {
    seedProfile();
    bootAnalytics();
    bootAnalytics();
    expect(events('app_open')).toHaveLength(1);
  });
});

describe('the stream is catalogue-clean and PII-free', () => {
  it('after driving every flow, all names and props keys are whitelisted and no profile data leaks', () => {
    seedProfile();
    bootAnalytics();
    usePlayerStore.getState().startMission('r1-m1');
    playToEnd(usePlayerStore, allCorrect);
    const concept = checkpointConceptOf('r1-m1');
    upsertMiss(db, concept, 'wrong', h.today);
    usePlayerStore.getState().startDrill([concept]);
    playToEnd(usePlayerStore, allCorrect);
    const ids = getPracticePool()
      .filter((q) => q.topic === 'lights')
      .slice(0, 3)
      .map((q) => q.id);
    usePlayerStore.getState().startPractice(ids, 'topic:lights');
    walkPractice();
    useMockStore.getState().startMock(MINI_MOCK_CONFIG);
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();

    const all = events();
    expect(all.length).toBeGreaterThanOrEqual(6);
    for (const e of all) {
      expect(EVENT_CATALOGUE.has(e.name), `unknown event name ${e.name}`).toBe(true);
      for (const [key, value] of Object.entries(e.props)) {
        expect(PROPS_WHITELIST.has(key), `unlisted prop ${key} on ${e.name}`).toBe(true);
        expect(['string', 'number', 'boolean'].includes(typeof value)).toBe(true);
      }
    }
    const serialized = JSON.stringify(
      db.all<{ name: string; props_json: string }>('SELECT name, props_json FROM analytics_event'),
    );
    expect(serialized).not.toContain('2026-08-05');
    expect(serialized).not.toContain('test_date');
  });
});
