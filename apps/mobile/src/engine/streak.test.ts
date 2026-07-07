import { describe, expect, it } from 'vitest';
import { computeStreak, hitMilestone } from './streak';

const TODAY = '2026-07-06';

describe('computeStreak', () => {
  it('three consecutive days ending today → 3', () => {
    expect(computeStreak(['2026-07-04', '2026-07-05', '2026-07-06'], TODAY)).toBe(3);
  });

  it('streak ending yesterday is still alive → 2', () => {
    expect(computeStreak(['2026-07-04', '2026-07-05'], TODAY)).toBe(2);
  });

  it('streak ending two days ago is dead → 0', () => {
    expect(computeStreak(['2026-07-03', '2026-07-04'], TODAY)).toBe(0);
  });

  it('only today → 1', () => {
    expect(computeStreak(['2026-07-06'], TODAY)).toBe(1);
  });

  it('no active days → 0', () => {
    expect(computeStreak([], TODAY)).toBe(0);
  });

  it('duplicates and unsorted input → 3', () => {
    expect(
      computeStreak(['2026-07-05', '2026-07-05', '2026-07-06', '2026-07-04'], TODAY),
    ).toBe(3);
  });
});

describe('hitMilestone', () => {
  it('(2,3) → 3', () => {
    expect(hitMilestone(2, 3)).toBe(3);
  });

  it('(3,3) → null', () => {
    expect(hitMilestone(3, 3)).toBeNull();
  });

  it('(6,7) → 7', () => {
    expect(hitMilestone(6, 7)).toBe(7);
  });

  it('(0,1) → null', () => {
    expect(hitMilestone(0, 1)).toBeNull();
  });
});
