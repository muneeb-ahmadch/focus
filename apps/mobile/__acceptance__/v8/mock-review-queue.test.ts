// Slice v8 gate: wrong mock answers feed the repair loop. On finalize
// (submitted OR auto_submitted) every answered-wrong question upserts a
// review_item with origin 'wrong' — one active item per concept (v5 invariant),
// weaker origins upgraded, correct/unanswered questions untouched. The store
// exposes wrongQuestionIds + savedConceptIds for the results surface.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOCK_DURATION_MS } from '@focus/engine';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';
import { getMockPool } from '@/lib/mockPool';
import { queryClient } from '@/lib/queryClient';
import { upsertMiss, type ReviewItem } from '@/db/repo/reviews';
import { useMockStore } from '@/stores/mockStore';

const START_MS = 1_780_000_000_000;

const h = vi.hoisted(() => ({ db: null as unknown, nowMs: 0 }));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('@/lib/clock', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/clock')>();
  return {
    ...real,
    now: () => new Date(h.nowMs),
    todayLocal: () => real.toLocalDay(new Date(h.nowMs)),
  };
});

let db: Db;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  h.db = db;
  h.nowMs = START_MS;
  useMockStore.setState(useMockStore.getInitialState());
});

const pool = () => getMockPool().questionById;
const concept = (questionId: string) => pool().get(questionId)!.conceptId;
const rightOption = (questionId: string) => pool().get(questionId)!.options.find((o) => o.correct)!.id;
const wrongOption = (questionId: string) => pool().get(questionId)!.options.find((o) => !o.correct)!.id;

function reviewRows(): ReviewItem[] {
  return db.all<ReviewItem>('SELECT * FROM review_item ORDER BY concept_id');
}

// Two paper questions on the SAME concept (dedupe case) plus one on a distinct
// concept, found dynamically — the paper is shuffled real content.
function pickWrongTargets(questionIds: string[]): { duo: [string, string] | null; solo: string } {
  const byConcept = new Map<string, string[]>();
  for (const id of questionIds) {
    const c = concept(id);
    byConcept.set(c, [...(byConcept.get(c) ?? []), id]);
  }
  let duo: [string, string] | null = null;
  for (const ids of byConcept.values()) {
    if (ids.length >= 2) {
      duo = [ids[0]!, ids[1]!];
      break;
    }
  }
  const duoConcept = duo ? concept(duo[0]) : null;
  const solo = questionIds.find((id) => concept(id) !== duoConcept)!;
  return { duo, solo };
}

describe('mock submit feeds the review queue', () => {
  it('wrong answers create active review items, origin wrong, due tomorrow, one per concept', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    const { duo, solo } = pickWrongTargets(ids);

    useMockStore.getState().answer(solo, wrongOption(solo));
    if (duo) {
      useMockStore.getState().answer(duo[0], wrongOption(duo[0]));
      useMockStore.getState().answer(duo[1], wrongOption(duo[1]));
    }
    const answeredCorrect = ids.find((id) => useMockStore.getState().answers[id] === undefined)!;
    useMockStore.getState().answer(answeredCorrect, rightOption(answeredCorrect));

    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();

    const rows = reviewRows();
    const expectedConcepts = new Set([concept(solo), ...(duo ? [concept(duo[0])] : [])]);
    expect(rows.length).toBe(expectedConcepts.size);
    for (const row of rows) {
      expect(expectedConcepts.has(row.concept_id)).toBe(true);
      expect(row.origin_type).toBe('wrong');
      expect(row.status).toBe('active');
      expect(row.due_at > '2026-01-01').toBe(true);
    }
    expect(rows.some((r) => r.concept_id === concept(answeredCorrect) && !expectedConcepts.has(r.concept_id))).toBe(false);

    const s = useMockStore.getState();
    const expectedWrong = duo ? [solo, ...duo] : [solo];
    expect([...s.wrongQuestionIds].sort()).toEqual([...expectedWrong].sort());
    expect([...s.savedConceptIds].sort()).toEqual([...expectedConcepts].sort());
  });

  it('wrongQuestionIds preserves paper order', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    useMockStore.getState().answer(ids[5]!, wrongOption(ids[5]!));
    useMockStore.getState().answer(ids[2]!, wrongOption(ids[2]!));
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();
    expect(useMockStore.getState().wrongQuestionIds).toEqual([ids[2]!, ids[5]!]);
  });

  it('an existing weaker-origin item on the same concept upgrades to wrong, stays a single row', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    const target = ids[0]!;
    upsertMiss(db, concept(target), 'slow', '2026-07-12');

    useMockStore.getState().answer(target, wrongOption(target));
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();

    const rows = reviewRows().filter((r) => r.concept_id === concept(target));
    expect(rows.length).toBe(1);
    expect(rows[0]!.origin_type).toBe('wrong');
    expect(rows[0]!.status).toBe('active');
  });

  it('correct and unanswered questions never create review items', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    useMockStore.getState().answer(ids[0]!, rightOption(ids[0]!));
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();

    expect(reviewRows()).toEqual([]);
    expect(useMockStore.getState().wrongQuestionIds).toEqual([]);
    expect(useMockStore.getState().savedConceptIds).toEqual([]);
  });

  it('expiry auto-submit saves wrong answers exactly like a manual submit', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    useMockStore.getState().answer(ids[0]!, wrongOption(ids[0]!));

    h.nowMs = START_MS + MOCK_DURATION_MS + 1;
    useMockStore.getState().tick();

    expect(useMockStore.getState().phase).toBe('expired');
    const rows = reviewRows();
    expect(rows.length).toBe(1);
    expect(rows[0]!.concept_id).toBe(concept(ids[0]!));
    expect(rows[0]!.origin_type).toBe('wrong');
    expect(useMockStore.getState().wrongQuestionIds).toEqual([ids[0]!]);
  });

  it('discarding a live mock saves nothing', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    useMockStore.getState().answer(ids[0]!, wrongOption(ids[0]!));
    useMockStore.getState().discard();

    expect(reviewRows()).toEqual([]);
  });

  // QA finding V8-Q2: the deadline must win in EVERY phase where it is still
  // live. Sitting on the submit-confirm screen past 57:00 previously left the
  // attempt in_progress forever — tick() only acted on 'running'.
  it('expiry fires from the submit-confirm phase too: auto_submitted, wrong answers saved', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    useMockStore.getState().answer(ids[0]!, wrongOption(ids[0]!));
    useMockStore.getState().requestSubmit();

    h.nowMs = START_MS + MOCK_DURATION_MS + 1;
    useMockStore.getState().tick();

    expect(useMockStore.getState().phase).toBe('expired');
    const row = db.get<{ status: string }>(
      `SELECT status FROM attempt WHERE attempt_type = 'mock' ORDER BY attempt_id DESC LIMIT 1`,
    );
    expect(row?.status).toBe('auto_submitted');
    expect(reviewRows().length).toBe(1);
  });

  // Home/Progress read readiness, XP, and due counts through react-query; a
  // finished or discarded mock must invalidate those caches exactly like the
  // playerStore finish paths do, or the readiness surface goes stale.
  it('finalize and discard invalidate the query cache', () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    useMockStore.getState().answer(ids[0]!, wrongOption(ids[0]!));
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();
    expect(spy).toHaveBeenCalled();

    spy.mockClear();
    useMockStore.getState().discard();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
