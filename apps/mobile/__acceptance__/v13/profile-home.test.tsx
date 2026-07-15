// @vitest-environment jsdom
// Slice v13 gate: full ProfileHome surfaces every settings destination — Schedule,
// Test date, Audio, Accessibility, Activity — plus the destructive Reset entry,
// each routing to the right screen.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileScreen from '../../app/(tabs)/profile';

const h = vi.hoisted(() => ({ push: vi.fn() }));

// ProfileScreen pulls @/db transitively (theme → settings store); mock it so the
// native SQLite adapter never loads under node. getDb is not called during render.
vi.mock('@/db', () => ({ getDb: () => ({}), initDb: async () => ({}) }));
vi.mock('expo-router', () => ({ router: { push: h.push, replace: () => {}, back: () => {} } }));

beforeEach(() => {
  h.push.mockClear();
});

afterEach(cleanup);

const ROWS: [string, string][] = [
  ['Schedule', '/settings/schedule'],
  ['Test date', '/settings/test-date'],
  ['Audio', '/settings/audio'],
  ['Accessibility', '/settings/accessibility'],
  ['Activity', '/activity'],
  ['Reset app', '/settings/reset'],
];

describe('ProfileHome', () => {
  it('renders every row and the app version', () => {
    render(<ProfileScreen />);
    for (const [label] of ROWS) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText(/Focus v/)).toBeTruthy();
  });

  it('each row navigates to its screen', () => {
    render(<ProfileScreen />);
    for (const [label, route] of ROWS) {
      h.push.mockClear();
      fireEvent.click(screen.getByText(label));
      expect(h.push, `${label} → ${route}`).toHaveBeenCalledWith(route);
    }
  });
});
