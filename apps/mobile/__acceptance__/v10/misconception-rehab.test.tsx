// @vitest-environment jsdom
// Slice v10 gate — §7 trigger rule, deterministic: the same misconception_id
// hit ≥2 times (any questions) seeds the rehab ladder with a belief-framed
// misconception card built ENTIRELY from the authored taxonomy row (never
// generated text); 1 hit — or a missing taxonomy row — falls back to the
// plain concept-level ladder. The belief card replaces the recall card (same
// question, belief framing), so the ladder length never grows.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerScreen } from '@/components/player/PlayerScreen';
import { conceptIndex, MISCONCEPTIONS, pickDrillQuestion } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { openTestDb } from '@/db/testing/adapter.node';
import { syncMisconceptionsFromContent } from '@/db/repo/misconceptions';
import { upsertMiss } from '@/db/repo/reviews';
import { usePlayerStore, type PlayerCard } from '@/stores/playerStore';

const START_MS = 1_780_000_000_000;

const h = vi.hoisted(() => ({ db: null as unknown, nowMs: 0 }));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn() },
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
vi.mock('expo-speech', () => ({ speak: vi.fn(), stop: vi.fn(), isSpeakingAsync: async () => false }));
vi.mock('@/notifications/scheduler', () => ({
  rescheduleAll: async () => {},
  requestPermissionOnce: async () => {},
}));

let db: Db;

// a real taxonomy entry whose concept has a recall question — the seedable case
const seedable = MISCONCEPTIONS.find((m) => pickDrillQuestion(m.conceptId) !== undefined)!;

// a real concept with a recall question but NO taxonomy entry — tie-break canvas
const taxonomyConcepts = new Set(MISCONCEPTIONS.map((m) => m.conceptId));
const bareConcept = [...conceptIndex.keys()].find(
  (c) => !taxonomyConcepts.has(c) && pickDrillQuestion(c) !== undefined,
)!;

let nextStep = 0;
function insertHits(misconceptionId: string, conceptId: string, count: number): void {
  // organic recording of misconception_id on wrong answers is pinned below;
  // trigger counting reads persisted events regardless of which flow wrote them
  for (let i = 0; i < count; i++) {
    db.run(
      `INSERT INTO attempt (attempt_type, content_id, status, started_at)
       VALUES ('lesson', 'seed', 'submitted', '2026-07-01T10:00:00.000Z')`,
    );
    const attemptId = db.get<{ id: number }>('SELECT last_insert_rowid() AS id')!.id;
    db.run(
      `INSERT INTO answer_event (attempt_id, step_id, concept_id, correct, confidence, misconception_id, answered_at)
       VALUES (?, ?, ?, 0, 'unsure', ?, '2026-07-01T10:00:00.000Z')`,
      [attemptId, `seed-step-${nextStep++}`, conceptId, misconceptionId],
    );
  }
}

function insertTaxonomyRow(misconceptionId: string, conceptId: string, belief: string): void {
  db.run(
    `INSERT INTO misconception (misconception_id, concept_id, wrong_belief, repair_note, source_ref)
     VALUES (?, ?, ?, 'Authored repair note.', 'HC-1')`,
    [misconceptionId, conceptId, belief],
  );
}

const rehabQueue = (): PlayerCard[] => usePlayerStore.getState().queue;

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  syncMisconceptionsFromContent(db, MISCONCEPTIONS);
  h.db = db;
  h.nowMs = START_MS;
  nextStep = 0;
  usePlayerStore.setState(usePlayerStore.getInitialState());
});

afterEach(() => {
  cleanup();
});

describe('organic recording (the trigger input)', () => {
  it('a wrong answer on a tagged distractor persists its misconception_id', () => {
    const target = [...conceptIndex.keys()]
      .map((c) => pickDrillQuestion(c))
      .find((dq) => dq && dq.question.options.some((o) => !o.correct && o.misconceptionId));
    expect(target).toBeTruthy();
    const tagged = target!.question.options.find((o) => !o.correct && o.misconceptionId)!;

    usePlayerStore.getState().startDrill([target!.conceptId]);
    usePlayerStore.getState().answer(tagged.id);

    const row = db.get<{ misconception_id: string | null }>(
      'SELECT misconception_id FROM answer_event ORDER BY id DESC LIMIT 1',
    );
    expect(row?.misconception_id).toBe(tagged.misconceptionId);
  });
});

describe('trigger determinism (§7)', () => {
  it('2 hits across different questions → rehab opens with the authored belief card', () => {
    insertHits(seedable.misconceptionId, seedable.conceptId, 2);
    usePlayerStore.getState().startRehab(seedable.conceptId);

    const first = rehabQueue()[0]!;
    expect(first.kind).toBe('step');
    const step = (first as Extract<PlayerCard, { kind: 'step' }>).step;
    expect(step.type).toBe('misconception');
    if (step.type !== 'misconception') return;
    expect(step.wrongBelief).toBe(seedable.wrongBelief);
    expect(step.repairNote).toBe(seedable.repairNote);
    // the belief card carries the concept's recall question — ladder length unchanged
    expect(step.question).toEqual(pickDrillQuestion(seedable.conceptId)!.question);
  });

  it('1 hit → plain concept-level ladder', () => {
    insertHits(seedable.misconceptionId, seedable.conceptId, 1);
    usePlayerStore.getState().startRehab(seedable.conceptId);
    expect(rehabQueue()[0]!.kind).toBe('drill-q');
  });

  it('zero hits → plain concept-level ladder', () => {
    usePlayerStore.getState().startRehab(seedable.conceptId);
    expect(rehabQueue()[0]!.kind).toBe('drill-q');
  });

  it('≥2 hits but no taxonomy row → concept-level fallback (§7 cut line)', () => {
    insertHits('m.ghost.belief', seedable.conceptId, 3);
    usePlayerStore.getState().startRehab(seedable.conceptId);
    expect(rehabQueue()[0]!.kind).toBe('drill-q');
  });

  it('hits on a DIFFERENT concept never seed this rehab', () => {
    insertHits(seedable.misconceptionId, seedable.conceptId, 5);
    usePlayerStore.getState().startRehab(bareConcept);
    expect(rehabQueue()[0]!.kind).toBe('drill-q');
  });

  it('two triggered beliefs on one concept: higher hit count wins; tie → lexicographically smaller id', () => {
    insertTaxonomyRow('m.test.aaa', bareConcept, 'Belief A');
    insertTaxonomyRow('m.test.bbb', bareConcept, 'Belief B');

    insertHits('m.test.aaa', bareConcept, 2);
    insertHits('m.test.bbb', bareConcept, 3);
    usePlayerStore.getState().startRehab(bareConcept);
    let step = (rehabQueue()[0] as Extract<PlayerCard, { kind: 'step' }>).step;
    expect(step.type === 'misconception' && step.wrongBelief).toBe('Belief B');

    usePlayerStore.setState(usePlayerStore.getInitialState());
    insertHits('m.test.aaa', bareConcept, 1); // now 3 vs 3
    usePlayerStore.getState().startRehab(bareConcept);
    step = (rehabQueue()[0] as Extract<PlayerCard, { kind: 'step' }>).step;
    expect(step.type === 'misconception' && step.wrongBelief).toBe('Belief A');
  });

  it('correct picks of a tagged option never count as hits', () => {
    // tagged ids only ever persist on wrong answers, but guard the query too:
    // a correct row carrying an id (future flows) must not trip the trigger
    for (let i = 0; i < 3; i++) {
      db.run(
        `INSERT INTO attempt (attempt_type, content_id, status, started_at)
         VALUES ('lesson', 'seed', 'submitted', '2026-07-01T10:00:00.000Z')`,
      );
      const attemptId = db.get<{ id: number }>('SELECT last_insert_rowid() AS id')!.id;
      db.run(
        `INSERT INTO answer_event (attempt_id, step_id, concept_id, correct, confidence, misconception_id, answered_at)
         VALUES (?, ?, ?, 1, 'sure', ?, '2026-07-01T10:00:00.000Z')`,
        [attemptId, `seed-step-${nextStep++}`, seedable.conceptId, seedable.misconceptionId],
      );
    }
    usePlayerStore.getState().startRehab(seedable.conceptId);
    expect(rehabQueue()[0]!.kind).toBe('drill-q');
  });
});

describe('seeded rehab behaviour', () => {
  beforeEach(() => {
    upsertMiss(db, seedable.conceptId, 'wrong', '2026-07-12');
    insertHits(seedable.misconceptionId, seedable.conceptId, 2);
  });

  it('renders the belief framing, and a full correct+sure walk clears the item (R5 walk)', () => {
    usePlayerStore.getState().startRehab(seedable.conceptId);
    const queue = rehabQueue();
    render(<PlayerScreen />);

    expect(screen.getByText(/some people think/i)).toBeTruthy();
    expect(screen.getByText(new RegExp(seedable.wrongBelief.slice(0, 25)))).toBeTruthy();

    for (let i = 0; i < queue.length; i++) {
      const card = queue[i]!;
      const question =
        card.kind === 'step'
          ? card.step.type === 'misconception'
            ? card.step.question
            : undefined
          : card.question;
      const correct = question!.options.find((o) => o.correct)!;
      fireEvent.click(screen.getByText(correct.text!));
      if (i === 0 && queue[0]!.kind === 'step') {
        expect(screen.getByText(seedable.repairNote)).toBeTruthy();
      }
      usePlayerStore.getState().confirmConfidence('sure');
    }

    expect(usePlayerStore.getState().phase).toBe('rehab-summary');
    expect(usePlayerStore.getState().rehabCleared).toBe(true);
    const item = db.get<{ status: string }>(
      'SELECT status FROM review_item WHERE concept_id = ?',
      [seedable.conceptId],
    );
    expect(item?.status).toBe('cleared');
  });

  it('a wrong answer on the belief card ends the rehab uncleared (ladder rule unchanged)', () => {
    usePlayerStore.getState().startRehab(seedable.conceptId);
    const first = rehabQueue()[0] as Extract<PlayerCard, { kind: 'step' }>;
    const step = first.step;
    if (step.type !== 'misconception') throw new Error('expected seeded belief card');
    const wrong = step.question.options.find((o) => !o.correct)!;

    usePlayerStore.getState().answer(wrong.id);
    usePlayerStore.getState().advance();

    expect(usePlayerStore.getState().phase).toBe('rehab-summary');
    expect(usePlayerStore.getState().rehabCleared).toBe(false);
    const item = db.get<{ status: string }>(
      'SELECT status FROM review_item WHERE concept_id = ?',
      [seedable.conceptId],
    );
    expect(item?.status).toBe('active');
  });
});
