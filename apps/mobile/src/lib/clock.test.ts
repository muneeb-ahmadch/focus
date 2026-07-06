import { describe, expect, it } from 'vitest';
import {
  __setDayOffset,
  addDaysLocal,
  diffDaysLocal,
  toLocalDay,
  todayLocal,
} from './clock';

describe('clock', () => {
  it('addDaysLocal crosses a month boundary', () => {
    expect(addDaysLocal('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('addDaysLocal crosses a year boundary', () => {
    expect(addDaysLocal('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('addDaysLocal subtracts across a month boundary', () => {
    expect(addDaysLocal('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('diffDaysLocal counts forward', () => {
    expect(diffDaysLocal('2026-07-06', '2026-07-20')).toBe(14);
  });

  it('diffDaysLocal counts backward', () => {
    expect(diffDaysLocal('2026-07-20', '2026-07-06')).toBe(-14);
  });

  it('__setDayOffset shifts todayLocal and reset restores it', () => {
    __setDayOffset(1);
    expect(todayLocal()).toBe(addDaysLocal(toLocalDay(new Date()), 1));
    __setDayOffset(0);
    expect(todayLocal()).toBe(toLocalDay(new Date()));
  });
});
