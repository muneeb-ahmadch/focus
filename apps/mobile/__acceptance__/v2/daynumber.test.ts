import { describe, expect, it } from 'vitest';
import { addDaysLocal, dayFromNumber, dayNumber } from '@/lib/clock';

// dayNumber/dayFromNumber are the app-side bridge to the engine's integer-day API.
// Suite runs under TZ=Europe/London (pinned in the test script), so the two UK DST
// transitions in 2026 (29 Mar spring forward, 25 Oct fall back) are exercised for real.
describe('local-calendar day numbers', () => {
  it('epoch anchor: 1970-01-01 → 0', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayFromNumber(0)).toBe('1970-01-01');
  });

  it.each([
    '2026-07-06',
    '2024-02-29',
    '2026-03-29',
    '2026-10-25',
    '2025-12-31',
    '2027-01-01',
  ])('round-trips %s', (day) => {
    expect(dayFromNumber(dayNumber(day))).toBe(day);
  });

  it('spring-forward day (23h) still advances the day number by exactly 1', () => {
    expect(dayNumber('2026-03-30') - dayNumber('2026-03-29')).toBe(1);
  });

  it('fall-back day (25h) still advances the day number by exactly 1', () => {
    expect(dayNumber('2026-10-26') - dayNumber('2026-10-25')).toBe(1);
  });

  it('agrees with addDaysLocal across 400 consecutive days spanning both DST transitions', () => {
    let day = '2026-01-01';
    let n = dayNumber(day);
    for (let i = 0; i < 400; i++) {
      const next = addDaysLocal(day, 1);
      expect(dayNumber(next)).toBe(n + 1);
      day = next;
      n += 1;
    }
  });

  it('offset arithmetic matches addDaysLocal for arbitrary jumps', () => {
    for (const [start, jump] of [
      ['2026-03-25', 10],
      ['2026-10-20', 10],
      ['2026-12-28', 7],
      ['2024-02-27', 3],
    ] as const) {
      expect(dayNumber(addDaysLocal(start, jump))).toBe(dayNumber(start) + jump);
    }
  });
});
