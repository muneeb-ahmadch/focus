// @vitest-environment jsdom
// V10-D1 pin (carried defect): the practice session summary's Done must return
// to the Practice tab — it landed on Home. The drill summary's Done keeps its
// Home destination (that flow is entered from Home/review queue).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerScreen } from '@/components/player/PlayerScreen';
import { getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { createProfile } from '@/db/repo/profile';
import { upsertMiss } from '@/db/repo/reviews';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { getPracticePool } from '@/lib/practicePool';
import { usePlayerStore } from '@/stores/playerStore';
import { allCorrect, playToEnd } from '../v2/driver';

const h = vi.hoisted(() => ({
  db: null as unknown,
  today: '2026-07-06',
  replace: vi.fn<(target: string) => void>(),
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: h.replace, push: vi.fn(), back: vi.fn() },
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

let db: Db;

function walkPracticeToSummary(): void {
  const ids = getPracticePool()
    .filter((q) => q.topic === 'lights')
    .slice(0, 2)
    .map((q) => q.id);
  usePlayerStore.getState().startPractice(ids, 'topic:lights');
  for (let i = 0; i < 50; i++) {
    const s = usePlayerStore.getState();
    if (s.phase === 'practice-summary') return;
    const card = s.queue[s.index];
    if (s.phase === 'card') {
      if (card.kind !== 'drill-q') throw new Error('practice queue must be drill questions');
      s.answer(card.question.options.find((o) => o.correct)!.id);
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
  h.replace.mockClear();
  syncRoutesFromContent(db, getRouteManifest());
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
});

afterEach(cleanup);

describe('summary Done destinations (V10-D1)', () => {
  it('practice summary Done returns to the Practice tab, not Home', () => {
    walkPracticeToSummary();
    render(<PlayerScreen />);
    fireEvent.click(screen.getByText('Done'));
    expect(h.replace).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledWith('/(tabs)/practice');
    expect(usePlayerStore.getState().active).toBe(false);
  });

  it('drill summary Done still goes Home', () => {
    const concept = getPracticePool()[0].conceptId;
    upsertMiss(db, concept, 'wrong', h.today);
    usePlayerStore.getState().startDrill([concept]);
    playToEnd(usePlayerStore, allCorrect);
    expect(usePlayerStore.getState().phase).toBe('drill-summary');
    render(<PlayerScreen />);
    fireEvent.click(screen.getByText('Done'));
    expect(h.replace).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledWith('/(tabs)');
  });
});
