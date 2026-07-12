// Slice v7 gate: mock attempt lifecycle through the mockStore — the same entry
// points the UI drives (R2). Covers: paper generation from the real content
// pool; persistence of every mutation into the in_progress attempt row; kill +
// resume with wall-clock remaining time; expiry auto-submit; submit flow with
// phase guards (R3); terminal-state immutability; the mock exemption from the
// stale-attempt sweep; corrupt resume payload fallback (R1).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOCK_DURATION_MS } from '@focus/engine';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { startAttempt } from '@/db/repo/attempts';
import { openTestDb } from '@/db/testing/adapter.node';
import { getMockPool, MOCK_BLUEPRINT } from '@/lib/mockPool';
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

function mockAttemptRow() {
  return db.get<{ attempt_id: number; status: string; score: number | null; result_payload_json: string | null }>(
    `SELECT attempt_id, status, score, result_payload_json FROM attempt
     WHERE attempt_type = 'mock' ORDER BY attempt_id DESC LIMIT 1`,
  );
}

function correctOptionId(questionId: string): string {
  const q = getMockPool().questionById.get(questionId)!;
  return q.options.find((o) => o.correct)!.id;
}

function wrongOptionId(questionId: string): string {
  const q = getMockPool().questionById.get(questionId)!;
  return q.options.find((o) => !o.correct)!.id;
}

function killApp(): void {
  useMockStore.setState(useMockStore.getInitialState());
}

describe('pool and paper', () => {
  it('the real content pool fills the blueprint: 50 unique questions, exactly 3 videos', () => {
    const { pool } = getMockPool();
    expect(pool.length).toBeGreaterThanOrEqual(MOCK_BLUEPRINT.total);
    expect(pool.filter((q) => q.video).length).toBeGreaterThanOrEqual(MOCK_BLUEPRINT.videoCount);

    useMockStore.getState().startMock();
    const s = useMockStore.getState();
    expect(s.phase).toBe('running');
    expect(s.paper?.questionIds).toHaveLength(50);
    expect(new Set(s.paper?.questionIds).size).toBe(50);
    expect(s.paper?.videoQuestionIds).toHaveLength(3);
  });

  it('startMock creates one in_progress mock attempt with a parseable payload; a second call is a no-op (R3)', () => {
    useMockStore.getState().startMock();
    useMockStore.getState().startMock();
    const rows = db.all<{ attempt_id: number }>(`SELECT attempt_id FROM attempt WHERE attempt_type = 'mock'`);
    expect(rows).toHaveLength(1);
    const payload = JSON.parse(mockAttemptRow()!.result_payload_json!) as { questionIds: string[]; startedAt: number };
    expect(payload.questionIds).toHaveLength(50);
    expect(payload.startedAt).toBe(START_MS);
  });
});

describe('mutations persist to the attempt row', () => {
  it('answers and flags survive in the payload as they happen', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    useMockStore.getState().answer(ids[0]!, correctOptionId(ids[0]!));
    useMockStore.getState().toggleFlag(ids[1]!);

    const payload = JSON.parse(mockAttemptRow()!.result_payload_json!) as {
      answers: Record<string, string>;
      flags: string[];
    };
    expect(payload.answers[ids[0]!]).toBe(correctOptionId(ids[0]!));
    expect(payload.flags).toContain(ids[1]!);
  });

  it('toggleFlag twice removes the flag; goto moves the index within bounds only', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    useMockStore.getState().toggleFlag(ids[2]!);
    useMockStore.getState().toggleFlag(ids[2]!);
    expect(useMockStore.getState().flags).toHaveLength(0);

    useMockStore.getState().goTo(49);
    expect(useMockStore.getState().index).toBe(49);
    useMockStore.getState().goTo(50);
    expect(useMockStore.getState().index).toBe(49);
  });
});

describe('kill and resume (wall clock)', () => {
  it('resumes the same paper, answers, and flags with time computed from startedAt', () => {
    useMockStore.getState().startMock();
    const ids = [...useMockStore.getState().paper!.questionIds];
    useMockStore.getState().answer(ids[0]!, wrongOptionId(ids[0]!));
    useMockStore.getState().toggleFlag(ids[5]!);

    killApp();
    h.nowMs = START_MS + 600_000;
    const outcome = useMockStore.getState().resumeMock();

    expect(outcome).toBe('resumed');
    const s = useMockStore.getState();
    expect(s.phase).toBe('running');
    expect(s.paper?.questionIds).toEqual(ids);
    expect(s.answers[ids[0]!]).toBe(wrongOptionId(ids[0]!));
    expect(s.flags).toContain(ids[5]!);
    expect(s.startedAt).toBe(START_MS);
  });

  it('resuming after the deadline auto-submits with only the recorded answers', () => {
    useMockStore.getState().startMock();
    const ids = [...useMockStore.getState().paper!.questionIds];
    useMockStore.getState().answer(ids[0]!, correctOptionId(ids[0]!));
    useMockStore.getState().answer(ids[1]!, correctOptionId(ids[1]!));
    useMockStore.getState().answer(ids[2]!, wrongOptionId(ids[2]!));

    killApp();
    h.nowMs = START_MS + MOCK_DURATION_MS + 1;
    const outcome = useMockStore.getState().resumeMock();

    expect(outcome).toBe('expired');
    const row = mockAttemptRow();
    expect(row?.status).toBe('auto_submitted');
    expect(row?.score).toBe(2);
  });

  it('with no dangling mock, resumeMock reports nothing to resume', () => {
    expect(useMockStore.getState().resumeMock()).toBeNull();
  });

  it('a corrupt payload abandons the attempt instead of crashing (R1)', () => {
    useMockStore.getState().startMock();
    db.run(`UPDATE attempt SET result_payload_json = '{"not":' WHERE attempt_type = 'mock'`);
    killApp();

    expect(useMockStore.getState().resumeMock()).toBeNull();
    expect(mockAttemptRow()?.status).toBe('abandoned');
  });
});

describe('expiry while running', () => {
  it('tick past the deadline auto-submits and moves to expired', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    useMockStore.getState().answer(ids[0]!, correctOptionId(ids[0]!));

    h.nowMs = START_MS + MOCK_DURATION_MS;
    useMockStore.getState().tick();

    expect(useMockStore.getState().phase).toBe('expired');
    const row = mockAttemptRow();
    expect(row?.status).toBe('auto_submitted');
    expect(row?.score).toBe(1);
  });

  it('tick before the deadline changes nothing', () => {
    useMockStore.getState().startMock();
    h.nowMs = START_MS + MOCK_DURATION_MS - 1000;
    useMockStore.getState().tick();
    expect(useMockStore.getState().phase).toBe('running');
    expect(mockAttemptRow()?.status).toBe('in_progress');
  });
});

describe('submit flow and phase guards', () => {
  it('requestSubmit → confirmSubmit scores answered questions; unanswered count as wrong', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;
    useMockStore.getState().answer(ids[0]!, correctOptionId(ids[0]!));
    useMockStore.getState().answer(ids[1]!, wrongOptionId(ids[1]!));

    useMockStore.getState().requestSubmit();
    expect(useMockStore.getState().phase).toBe('submit-confirm');
    useMockStore.getState().confirmSubmit();

    const s = useMockStore.getState();
    expect(s.phase).toBe('submitted');
    expect(s.score).toBe(1);
    expect(s.passed).toBe(false);
    const row = mockAttemptRow();
    expect(row?.status).toBe('submitted');
    expect(row?.score).toBe(1);
    const events = db.all<{ correct: number }>(
      `SELECT correct FROM answer_event WHERE attempt_id = ? ORDER BY id`,
      [row!.attempt_id],
    );
    expect(events).toEqual([{ correct: 1 }, { correct: 0 }]);
  });

  it('cancelSubmit returns to running; answer/confirm are rejected outside their phases (R3)', () => {
    useMockStore.getState().startMock();
    const ids = useMockStore.getState().paper!.questionIds;

    useMockStore.getState().confirmSubmit();
    expect(useMockStore.getState().phase).toBe('running');

    useMockStore.getState().requestSubmit();
    useMockStore.getState().answer(ids[0]!, correctOptionId(ids[0]!));
    expect(useMockStore.getState().answers[ids[0]!]).toBeUndefined();

    useMockStore.getState().cancelSubmit();
    expect(useMockStore.getState().phase).toBe('running');
    useMockStore.getState().answer(ids[0]!, correctOptionId(ids[0]!));
    expect(useMockStore.getState().answers[ids[0]!]).toBe(correctOptionId(ids[0]!));
  });

  it('a submitted attempt is immutable: double confirm and late ticks change nothing (R6)', () => {
    useMockStore.getState().startMock();
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();
    const before = mockAttemptRow();

    useMockStore.getState().confirmSubmit();
    h.nowMs = START_MS + MOCK_DURATION_MS + 1;
    useMockStore.getState().tick();

    expect(mockAttemptRow()).toEqual(before);
    expect(useMockStore.getState().phase).toBe('submitted');
  });

  it('discard abandons a running mock and resets; on a terminal mock it only resets', () => {
    useMockStore.getState().startMock();
    useMockStore.getState().discard();
    expect(useMockStore.getState().phase).toBe('idle');
    expect(mockAttemptRow()?.status).toBe('abandoned');

    useMockStore.getState().startMock();
    useMockStore.getState().requestSubmit();
    useMockStore.getState().confirmSubmit();
    useMockStore.getState().discard();
    expect(useMockStore.getState().phase).toBe('idle');
    expect(mockAttemptRow()?.status).toBe('submitted');
  });
});

describe('self-healing mock hygiene', () => {
  it('startMock abandons any stray in_progress mock rows so exactly one ever lives', () => {
    db.run(
      `INSERT INTO attempt (attempt_type, content_id, status, started_at)
       VALUES ('mock', 'mock', 'in_progress', '2026-07-01T10:00:00Z'),
              ('mock', 'mock', 'in_progress', '2026-07-02T10:00:00Z')`,
    );
    useMockStore.getState().startMock();

    const rows = db.all<{ status: string }>(
      `SELECT status FROM attempt WHERE attempt_type = 'mock' ORDER BY attempt_id`,
    );
    expect(rows).toEqual([
      { status: 'abandoned' },
      { status: 'abandoned' },
      { status: 'in_progress' },
    ]);
  });
});

describe('sweep exemption', () => {
  it('starting a lesson attempt does not abandon an in_progress mock', () => {
    useMockStore.getState().startMock();
    startAttempt(db, 'lesson', 'r1-m1');
    expect(mockAttemptRow()?.status).toBe('in_progress');
  });

  it('non-mock attempts are still swept by a new attempt start', () => {
    startAttempt(db, 'lesson', 'r1-m1');
    startAttempt(db, 'drill', 'drill');
    const stale = db.all<{ status: string }>(
      `SELECT status FROM attempt WHERE attempt_type = 'lesson'`,
    );
    expect(stale).toEqual([{ status: 'abandoned' }]);
  });
});
