import { describe, expect, it } from 'vitest';
import {
  drillXp,
  missionXp,
  rehabXp,
  XP_MISSION_BASE,
  XP_PER_DRILL_CORRECT,
  XP_PERFECT_BONUS,
  XP_REHAB_CLEAR,
} from '../src/xp';

describe('missionXp', () => {
  it('pass at threshold earns the base award', () => {
    expect(missionXp(0.8)).toBe(XP_MISSION_BASE);
  });

  it('perfect checkpoint earns the bonus', () => {
    expect(missionXp(1)).toBe(XP_MISSION_BASE + XP_PERFECT_BONUS);
  });

  it('repair-path completion (score 0) still earns the base award', () => {
    expect(missionXp(0)).toBe(XP_MISSION_BASE);
  });

  it('out-of-range scores fall back to the base award', () => {
    expect(missionXp(-0.5)).toBe(XP_MISSION_BASE);
    expect(missionXp(1.5)).toBe(XP_MISSION_BASE);
  });
});

describe('drillXp', () => {
  it('scales with correct answers', () => {
    expect(drillXp(0)).toBe(0);
    expect(drillXp(3)).toBe(3 * XP_PER_DRILL_CORRECT);
  });

  it('never negative', () => {
    expect(drillXp(-2)).toBe(0);
  });
});

describe('rehabXp', () => {
  it('cleared → award, not cleared → nothing', () => {
    expect(rehabXp(true)).toBe(XP_REHAB_CLEAR);
    expect(rehabXp(false)).toBe(0);
  });
});
