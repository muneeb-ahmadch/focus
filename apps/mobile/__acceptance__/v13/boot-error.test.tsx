// @vitest-environment jsdom
// Slice v13 gate (empty/error sweep): a failed initDb() must show a recovery
// screen with a working retry, never hang on a blank splash.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import RootLayout from '../../app/_layout';

const h = vi.hoisted(() => ({ initDb: vi.fn() }));

const stubDb = { get: () => undefined, all: () => [], run: () => {}, exec: () => {}, transaction: (f: () => unknown) => f() };

vi.mock('@/db', () => ({ initDb: h.initDb, getDb: () => stubDb }));
vi.mock('expo-router', () => ({
  router: { replace: () => {}, back: () => {}, push: () => {} },
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  Stack: Object.assign(({ children }: { children?: ReactNode }) => <>{children}</>, {
    Screen: () => null,
  }),
}));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('@/lib/analytics', () => ({ bootAnalytics: () => {} }));
vi.mock('@/lib/speech', () => ({ initNarrationVoice: async () => {} }));
vi.mock('@/notifications/scheduler', () => ({ rescheduleAll: async () => {} }));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

beforeEach(() => {
  h.initDb.mockReset();
});

afterEach(cleanup);

describe('RootLayout boot failure', () => {
  it('shows a recovery screen when initDb rejects', async () => {
    h.initDb.mockRejectedValue(new Error('corrupt db'));
    render(<RootLayout />);
    await screen.findByText(/Couldn.t load your data/);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('retry re-runs boot and clears the error on success', async () => {
    h.initDb.mockRejectedValueOnce(new Error('corrupt db')).mockResolvedValue(stubDb);
    render(<RootLayout />);
    await screen.findByText(/Couldn.t load your data/);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.queryByText(/Couldn.t load your data/)).toBeNull());
    expect(h.initDb).toHaveBeenCalledTimes(2);
  });
});
