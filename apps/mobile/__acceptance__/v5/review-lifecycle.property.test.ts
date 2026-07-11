// Slice v5 gate: full review_item lifecycle property. Spec anchor (SLICES v5):
// ONE active review_item per concept — after ANY event sequence a concept has
// exactly one row (a second trigger updates it, never inserts) and at most one
// active row. Snoozed items resurface through the due predicate when their
// snooze expires; cleared/snoozed items reactivate on the next miss.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import {
  applyGrade,
  clearItem,
  countActiveDueOnOrBefore,
  getAllReviewItems,
  getDue,
  snoozeItem,
  upsertMiss,
  type ReviewOrigin,
} from '@/db/repo/reviews';
import { openTestDb } from '@/db/testing/adapter.node';
import { addDaysLocal } from '@/lib/clock';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

const CONCEPTS = ['c-a', 'c-b', 'c-c'] as const;
const ORIGINS: readonly ReviewOrigin[] = ['wrong', 'unsure', 'slow', 'hint_heavy'];
const GRADES = ['wrong', 'unsure', 'okay', 'easy'] as const;
const START = '2026-07-10';

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
});

describe('review_item lifecycle property', () => {
  it('after any random event sequence: one row per concept, ≤1 active per concept, valid status', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = lcg(seed * 2654435761);
      const fresh = openTestDb();
      migrate(fresh);
      let today = START;
      for (let step = 0; step < 60; step++) {
        const concept = pick(rng, CONCEPTS);
        const op = Math.floor(rng() * 5);
        if (op === 0) upsertMiss(fresh, concept, pick(rng, ORIGINS), today);
        else if (op === 1) applyGrade(fresh, concept, pick(rng, GRADES), today);
        else if (op === 2) snoozeItem(fresh, concept, today);
        else if (op === 3) clearItem(fresh, concept, today);
        else today = addDaysLocal(today, 1);

        const rows = getAllReviewItems(fresh);
        for (const concept2 of CONCEPTS) {
          const forConcept = rows.filter((r) => r.concept_id === concept2);
          expect(
            forConcept.length,
            `seed ${seed} step ${step}: concept ${concept2} has ${forConcept.length} rows`,
          ).toBeLessThanOrEqual(1);
          const active = forConcept.filter((r) => r.status === 'active');
          expect(active.length, `seed ${seed} step ${step}: >1 active for ${concept2}`).toBeLessThanOrEqual(1);
        }
        for (const row of rows) {
          expect(['active', 'cleared', 'snoozed']).toContain(row.status);
          expect(['wrong', 'unsure', 'slow', 'hint_heavy']).toContain(row.origin_type);
        }
      }
    }
  });
});

describe('lifecycle transitions', () => {
  it('a second trigger on the same concept updates the existing item, never inserts', () => {
    upsertMiss(db, 'c-a', 'wrong', START);
    upsertMiss(db, 'c-a', 'unsure', START);
    upsertMiss(db, 'c-a', 'hint_heavy', addDaysLocal(START, 1));
    const rows = getAllReviewItems(db).filter((r) => r.concept_id === 'c-a');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('active');
  });

  it('origin upgrades by precedence and never downgrades (QA v5 finding 2)', () => {
    // precedence: wrong > hint_heavy > unsure > slow
    upsertMiss(db, 'c-up', 'slow', START);
    upsertMiss(db, 'c-up', 'unsure', START);
    expect(getAllReviewItems(db).find((r) => r.concept_id === 'c-up')!.origin_type).toBe('unsure');
    upsertMiss(db, 'c-up', 'wrong', START);
    expect(getAllReviewItems(db).find((r) => r.concept_id === 'c-up')!.origin_type).toBe('wrong');

    upsertMiss(db, 'c-down', 'wrong', START);
    upsertMiss(db, 'c-down', 'hint_heavy', START);
    upsertMiss(db, 'c-down', 'slow', START);
    expect(getAllReviewItems(db).find((r) => r.concept_id === 'c-down')!.origin_type).toBe('wrong');

    upsertMiss(db, 'c-mid', 'unsure', START);
    upsertMiss(db, 'c-mid', 'hint_heavy', START);
    expect(getAllReviewItems(db).find((r) => r.concept_id === 'c-mid')!.origin_type).toBe(
      'hint_heavy',
    );
  });

  it('all four origin types persist', () => {
    upsertMiss(db, 'o-wrong', 'wrong', START);
    upsertMiss(db, 'o-unsure', 'unsure', START);
    upsertMiss(db, 'o-slow', 'slow', START);
    upsertMiss(db, 'o-hint', 'hint_heavy', START);
    const byId = new Map(getAllReviewItems(db).map((r) => [r.concept_id, r.origin_type]));
    expect(byId.get('o-wrong')).toBe('wrong');
    expect(byId.get('o-unsure')).toBe('unsure');
    expect(byId.get('o-slow')).toBe('slow');
    expect(byId.get('o-hint')).toBe('hint_heavy');
  });

  it('snooze pushes due_at 3 days out and leaves the queue until it expires', () => {
    upsertMiss(db, 'c-a', 'wrong', START);
    const due = addDaysLocal(START, 1);
    expect(getDue(db, due).map((r) => r.concept_id)).toEqual(['c-a']);

    snoozeItem(db, 'c-a', due);
    expect(getDue(db, due)).toHaveLength(0);
    expect(countActiveDueOnOrBefore(db, due)).toBe(0);
    const snoozed = getAllReviewItems(db)[0]!;
    expect(snoozed.status).toBe('snoozed');
    expect(snoozed.due_at).toBe(addDaysLocal(due, 3));

    const resurfaceDay = addDaysLocal(due, 3);
    expect(getDue(db, resurfaceDay).map((r) => r.concept_id)).toEqual(['c-a']);
    expect(countActiveDueOnOrBefore(db, resurfaceDay)).toBe(1);
  });

  it('clearItem retires the item; the next miss reactivates the same row with a lapse', () => {
    upsertMiss(db, 'c-a', 'wrong', START);
    clearItem(db, 'c-a', START);
    expect(getDue(db, addDaysLocal(START, 30))).toHaveLength(0);

    upsertMiss(db, 'c-a', 'wrong', addDaysLocal(START, 2));
    const rows = getAllReviewItems(db).filter((r) => r.concept_id === 'c-a');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('active');
    expect(rows[0]!.lapses).toBe(1);
    expect(rows[0]!.interval_days).toBe(1);
  });

  it('snoozing or clearing a concept with no review row is a no-op, not an insert', () => {
    snoozeItem(db, 'ghost', START);
    clearItem(db, 'ghost', START);
    expect(getAllReviewItems(db)).toHaveLength(0);
  });
});
