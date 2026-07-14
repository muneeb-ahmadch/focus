// @vitest-environment jsdom
// Slice v10 gate — V9-D1 pin: MockStart must never go stale against the live
// session. Backing out of the runner returns to a MockStart that still offers
// Resume/Discard (the variant is derived from the store, not a mount-time
// peek), one tap of Discard persists `abandoned` immediately, and the Start
// guard is never left burned after the flow changes underneath it.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MockStartScreen from '../../app/mock/index';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';
import { MINI_MOCK_CONFIG, useMockStore } from '@/stores/mockStore';

const START_MS = 1_780_000_000_000;

const h = vi.hoisted(() => ({ db: null as unknown, nowMs: 0, push: vi.fn(), back: vi.fn() }));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { push: h.push, back: h.back, replace: vi.fn() },
  useFocusEffect: (cb: () => void) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(cb, [cb]);
  },
  useLocalSearchParams: () => ({}),
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
  SafeAreaView: ({ children }: { children?: import('react').ReactNode }) => <>{children}</>,
}));
vi.mock('@/notifications/scheduler', () => ({
  rescheduleAll: async () => {},
  requestPermissionOnce: async () => {},
}));

let db: Db;

const mockAttempts = () =>
  db.all<{ attempt_id: number; status: string }>(
    `SELECT attempt_id, status FROM attempt WHERE attempt_type = 'mock' ORDER BY attempt_id`,
  );

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  h.db = db;
  h.nowMs = START_MS;
  h.push.mockClear();
  h.back.mockClear();
  useMockStore.setState(useMockStore.getInitialState());
});

afterEach(() => {
  cleanup();
});

describe('MockStart re-entry against a live in-session mock (V9-D1)', () => {
  it('after Start, the same rendered screen flips to Resume/Discard — no dead Start button', () => {
    render(<MockStartScreen />);
    fireEvent.click(screen.getByRole('button', { name: /start mock/i }));
    expect(useMockStore.getState().phase).toBe('running');

    // the screen is still mounted under the runner; it must now offer the
    // live session, not a stale start variant with a burned guard
    expect(screen.getByRole('button', { name: /resume/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /discard/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /start mock/i })).toBeNull();
  });

  it('a remounted MockStart (fresh navigation) also offers the live session', () => {
    useMockStore.getState().startMock();
    render(<MockStartScreen />);
    expect(screen.getByRole('button', { name: /resume/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /start mock/i })).toBeNull();
  });

  it('Resume continues the SAME paper: no new attempt row, store state intact', () => {
    useMockStore.getState().startMock();
    const attemptId = useMockStore.getState().attemptId;
    const paper = useMockStore.getState().paper;
    render(<MockStartScreen />);
    fireEvent.click(screen.getByRole('button', { name: /resume/i }));

    expect(useMockStore.getState().attemptId).toBe(attemptId);
    expect(useMockStore.getState().paper).toBe(paper);
    expect(mockAttempts()).toHaveLength(1);
    expect(JSON.stringify(h.push.mock.calls)).toContain('/mock/runner');
  });

  it('one tap of Discard persists abandoned and flips to the start variant', () => {
    useMockStore.getState().startMock();
    render(<MockStartScreen />);
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));

    expect(mockAttempts()).toEqual([{ attempt_id: 1, status: 'abandoned' }]);
    expect(useMockStore.getState().phase).toBe('idle');
    expect(screen.getByRole('button', { name: /start mock/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /discard/i })).toBeNull();
  });

  it('reload simulation: fresh store + dangling DB row → one Discard persists, and a remount shows Start (never the prompt again)', () => {
    useMockStore.getState().startMock();
    useMockStore.setState(useMockStore.getInitialState()); // app reload

    const first = render(<MockStartScreen />);
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    expect(mockAttempts()).toEqual([{ attempt_id: 1, status: 'abandoned' }]);
    expect(screen.getByRole('button', { name: /start mock/i })).toBeTruthy();
    first.unmount();

    render(<MockStartScreen />);
    expect(screen.getByRole('button', { name: /start mock/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /discard/i })).toBeNull();
  });

  it('R6: hammering Discard abandons once and never throws', () => {
    useMockStore.getState().startMock();
    render(<MockStartScreen />);
    const discard = screen.getByRole('button', { name: /discard/i });
    fireEvent.click(discard);
    fireEvent.click(discard);

    expect(mockAttempts()).toEqual([{ attempt_id: 1, status: 'abandoned' }]);
    expect(useMockStore.getState().phase).toBe('idle');
  });

  it('QA V10-Q1: a live MINI mock never masquerades here — Start shows, and starting a real paper discards the parked mini', () => {
    useMockStore.getState().startMock(MINI_MOCK_CONFIG);
    render(<MockStartScreen />);

    expect(screen.getByRole('button', { name: /start mock/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /resume/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /start mock/i }));
    expect(useMockStore.getState().phase).toBe('running');
    expect(useMockStore.getState().runConfig.contentId).toBe('mock');

    const mini = db.get<{ status: string }>(
      `SELECT status FROM attempt WHERE content_id = 'mini-mock'`,
    );
    expect(mini?.status).toBe('abandoned');
    expect(mockAttempts()).toEqual([{ attempt_id: 2, status: 'in_progress' }]);
  });

  it('after a Discard, Start still works: new attempt, navigation fires (guard not burned)', () => {
    useMockStore.getState().startMock();
    render(<MockStartScreen />);
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    fireEvent.click(screen.getByRole('button', { name: /start mock/i }));

    expect(useMockStore.getState().phase).toBe('running');
    expect(mockAttempts()).toEqual([
      { attempt_id: 1, status: 'abandoned' },
      { attempt_id: 2, status: 'in_progress' },
    ]);
    expect(JSON.stringify(h.push.mock.calls)).toContain('/mock/runner');
  });
});
