import { create } from 'zustand';
import { z } from 'zod';
import {
  generateMock,
  mockRemainingMs,
  MINI_MOCK_BLUEPRINT,
  MINI_MOCK_DURATION_MS,
  MINI_MOCK_PASS_MARK,
  MOCK_DURATION_MS,
  MOCK_PASS_MARK,
  type Blueprint,
  type MockHistoryAttempt,
  type MockPaper,
} from '@focus/engine';
import { getDb } from '@/db';
import type { Db } from '@/db/adapter';
import { bumpActivity } from '@/db/repo/activity';
import { finishAttempt, recordAnswer, startAttempt } from '@/db/repo/attempts';
import { upsertMiss } from '@/db/repo/reviews';
import { flush, track } from '@/lib/analytics';
import { now, todayLocal } from '@/lib/clock';
import { getMockPool, MOCK_BLUEPRINT } from '@/lib/mockPool';
import { queryClient } from '@/lib/queryClient';

export type MockPhase = 'idle' | 'running' | 'submit-confirm' | 'expired' | 'submitted';

export interface MockRunConfig {
  blueprint: Blueprint;
  durationMs: number;
  passMark: number;
  attemptType: 'mock' | 'practice';
  contentId: string;
}

export const REAL_MOCK_CONFIG: MockRunConfig = {
  blueprint: MOCK_BLUEPRINT,
  durationMs: MOCK_DURATION_MS,
  passMark: MOCK_PASS_MARK,
  attemptType: 'mock',
  contentId: 'mock',
};

export const MINI_MOCK_CONFIG: MockRunConfig = {
  blueprint: MINI_MOCK_BLUEPRINT,
  durationMs: MINI_MOCK_DURATION_MS,
  passMark: MINI_MOCK_PASS_MARK,
  attemptType: 'practice',
  contentId: 'mini-mock',
};

const runPayloadSchema = z.object({
  questionIds: z.array(z.string()),
  videoQuestionIds: z.array(z.string()),
  exclusionWindow: z.number(),
  startedAt: z.number(),
  answers: z.record(z.string(), z.string()),
  flags: z.array(z.string()),
});
type RunPayload = z.infer<typeof runPayloadSchema>;

const historySchema = z.object({
  questionIds: z.array(z.string()),
  startedAt: z.number(),
});

interface MockState {
  phase: MockPhase;
  runConfig: MockRunConfig;
  attemptId?: number;
  paper?: MockPaper;
  startedAt: number;
  index: number;
  answers: Record<string, string>;
  flags: string[];
  score?: number;
  passed?: boolean;
  wrongQuestionIds: string[];
  savedConceptIds: string[];
  startMock(config?: MockRunConfig): void;
  answer(questionId: string, optionId: string): void;
  toggleFlag(questionId: string): void;
  goTo(i: number): void;
  requestSubmit(): void;
  cancelSubmit(): void;
  confirmSubmit(): void;
  tick(): void;
  resumeMock(): 'resumed' | 'expired' | null;
  discard(): void;
  discardDangling(): void;
}

const initial = {
  phase: 'idle' as MockPhase,
  runConfig: REAL_MOCK_CONFIG,
  attemptId: undefined as number | undefined,
  paper: undefined as MockPaper | undefined,
  startedAt: 0,
  index: 0,
  answers: {} as Record<string, string>,
  flags: [] as string[],
  score: undefined as number | undefined,
  passed: undefined as boolean | undefined,
  wrongQuestionIds: [] as string[],
  savedConceptIds: [] as string[],
};

function parseRun(json: string | null): RunPayload | null {
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const result = runPayloadSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

function loadHistory(db: Db): MockHistoryAttempt[] {
  const rows = db.all<{ result_payload_json: string | null }>(
    `SELECT result_payload_json FROM attempt
     WHERE attempt_type = 'mock' AND status IN ('submitted','auto_submitted')
     ORDER BY started_at ASC`,
  );
  const history: MockHistoryAttempt[] = [];
  for (const row of rows) {
    if (!row.result_payload_json) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.result_payload_json);
    } catch {
      continue;
    }
    const result = historySchema.safeParse(parsed);
    if (result.success) {
      history.push({ questionIds: result.data.questionIds, startedAt: result.data.startedAt });
    }
  }
  return history;
}

export function peekDanglingMock(): 'live' | 'expired' | null {
  const row = getDb().get<{ result_payload_json: string | null }>(
    `SELECT result_payload_json FROM attempt
     WHERE attempt_type = 'mock' AND status = 'in_progress'
     ORDER BY attempt_id DESC LIMIT 1`,
  );
  if (!row) return null;
  const payload = parseRun(row.result_payload_json);
  if (!payload) return null;
  return mockRemainingMs(payload.startedAt, now().getTime()) > 0 ? 'live' : 'expired';
}

export const useMockStore = create<MockState>((set, get) => {
  function persistRun(): void {
    const s = get();
    if (s.attemptId === undefined || !s.paper) return;
    const payload: RunPayload = {
      questionIds: s.paper.questionIds,
      videoQuestionIds: s.paper.videoQuestionIds,
      exclusionWindow: s.paper.exclusionWindow,
      startedAt: s.startedAt,
      answers: s.answers,
      flags: s.flags,
    };
    getDb().run(
      `UPDATE attempt SET result_payload_json = ? WHERE attempt_id = ? AND status = 'in_progress'`,
      [JSON.stringify(payload), s.attemptId],
    );
  }

  function finalize(status: 'submitted' | 'auto_submitted'): boolean {
    const s = get();
    if (s.phase !== 'running' && s.phase !== 'submit-confirm') return false;
    if (s.attemptId === undefined || !s.paper) return false;
    const db = getDb();
    const { questionById } = getMockPool();
    const today = todayLocal();
    let correctCount = 0;
    const wrongQuestionIds: string[] = [];
    const savedConceptIds: string[] = [];
    const seenConcepts = new Set<string>();
    for (const questionId of s.paper.questionIds) {
      const optionId = s.answers[questionId];
      if (optionId === undefined) continue;
      const question = questionById.get(questionId);
      if (!question) continue;
      const chosen = question.options.find((o) => o.id === optionId);
      const isRight = chosen?.correct === true;
      recordAnswer(db, s.attemptId, {
        stepId: questionId,
        conceptId: question.conceptId,
        correct: isRight,
        confidence: 'sure',
      });
      if (isRight) {
        correctCount += 1;
      } else {
        wrongQuestionIds.push(questionId);
        if (!seenConcepts.has(question.conceptId)) {
          seenConcepts.add(question.conceptId);
          savedConceptIds.push(question.conceptId);
          upsertMiss(db, question.conceptId, 'wrong', today);
        }
      }
    }
    const passed = correctCount >= s.runConfig.passMark;
    const payload: RunPayload = {
      questionIds: s.paper.questionIds,
      videoQuestionIds: s.paper.videoQuestionIds,
      exclusionWindow: s.paper.exclusionWindow,
      startedAt: s.startedAt,
      answers: s.answers,
      flags: s.flags,
    };
    finishAttempt(db, s.attemptId, status, correctCount, JSON.stringify(payload));
    if (s.runConfig.attemptType === 'mock') bumpActivity(db, today, 'mocks_completed');
    track('mock_completed', {
      kind: s.runConfig.attemptType === 'mock' ? 'real' : 'mini',
      score: correctCount,
      passed,
    });
    void flush();
    set({ score: correctCount, passed, wrongQuestionIds, savedConceptIds });
    void queryClient.invalidateQueries();
    return true;
  }

  return {
    ...initial,

    startMock(config = REAL_MOCK_CONFIG) {
      if (get().phase !== 'idle') return;
      const db = getDb();
      const { pool } = getMockPool();
      const history = config.attemptType === 'mock' ? loadHistory(db) : [];
      const paper = generateMock(pool, history, config.blueprint, Math.random);
      // self-healing: no UI path starts a REAL mock over a live one, but a stray
      // in_progress row (corrupt payload, tampering) must never accumulate.
      // A mini mock must NOT run this — it would destroy a resumable real paper.
      if (config.attemptType === 'mock') {
        db.run(
          `UPDATE attempt SET status = 'abandoned', completed_at = ?
           WHERE attempt_type = 'mock' AND status = 'in_progress'`,
          [now().toISOString()],
        );
      }
      const attemptId = startAttempt(db, config.attemptType, config.contentId);
      track('mock_started', { kind: config.attemptType === 'mock' ? 'real' : 'mini' });
      const startedAt = now().getTime();
      set({
        ...initial,
        phase: 'running',
        runConfig: config,
        attemptId,
        paper,
        startedAt,
        index: 0,
      });
      persistRun();
    },

    answer(questionId, optionId) {
      const s = get();
      if (s.phase !== 'running') return;
      set({ answers: { ...s.answers, [questionId]: optionId } });
      persistRun();
    },

    toggleFlag(questionId) {
      const s = get();
      if (s.phase !== 'running') return;
      const flags = s.flags.includes(questionId)
        ? s.flags.filter((id) => id !== questionId)
        : [...s.flags, questionId];
      set({ flags });
      persistRun();
    },

    goTo(i) {
      const s = get();
      if (s.phase !== 'running' || !s.paper) return;
      if (i < 0 || i >= s.paper.questionIds.length) return;
      set({ index: i });
    },

    requestSubmit() {
      if (get().phase !== 'running') return;
      set({ phase: 'submit-confirm' });
    },

    cancelSubmit() {
      if (get().phase !== 'submit-confirm') return;
      set({ phase: 'running' });
    },

    confirmSubmit() {
      if (get().phase !== 'submit-confirm') return;
      if (finalize('submitted')) set({ phase: 'submitted' });
    },

    tick() {
      const s = get();
      // the deadline is live on the confirm screen too — sitting there must
      // not hold the paper open past 57:00 (QA V8-Q2)
      if (s.phase !== 'running' && s.phase !== 'submit-confirm') return;
      if (mockRemainingMs(s.startedAt, now().getTime(), s.runConfig.durationMs) > 0) return;
      if (finalize('auto_submitted')) set({ phase: 'expired' });
    },

    resumeMock() {
      if (get().phase !== 'idle') return null;
      const db = getDb();
      const row = db.get<{ attempt_id: number; result_payload_json: string | null }>(
        `SELECT attempt_id, result_payload_json FROM attempt
         WHERE attempt_type = 'mock' AND status = 'in_progress'
         ORDER BY attempt_id DESC LIMIT 1`,
      );
      if (!row) return null;
      const payload = parseRun(row.result_payload_json);
      if (!payload) {
        finishAttempt(db, row.attempt_id, 'abandoned', null, null);
        return null;
      }
      const paper: MockPaper = {
        questionIds: payload.questionIds,
        videoQuestionIds: payload.videoQuestionIds,
        exclusionWindow: payload.exclusionWindow,
      };
      set({
        ...initial,
        phase: 'running',
        runConfig: REAL_MOCK_CONFIG,
        attemptId: row.attempt_id,
        paper,
        startedAt: payload.startedAt,
        answers: payload.answers,
        flags: payload.flags,
      });
      if (mockRemainingMs(payload.startedAt, now().getTime(), REAL_MOCK_CONFIG.durationMs) <= 0) {
        finalize('auto_submitted');
        set({ phase: 'expired' });
        return 'expired';
      }
      const firstUnanswered = payload.questionIds.findIndex((id) => payload.answers[id] === undefined);
      set({ index: firstUnanswered === -1 ? 0 : firstUnanswered });
      return 'resumed';
    },

    discard() {
      const s = get();
      if (s.attemptId !== undefined) finishAttempt(getDb(), s.attemptId, 'abandoned', null, null);
      set({ ...initial });
      void queryClient.invalidateQueries();
    },

    discardDangling() {
      const db = getDb();
      db.run(
        `UPDATE attempt SET status = 'abandoned', completed_at = ?
         WHERE attempt_type = 'mock' AND status = 'in_progress'`,
        [now().toISOString()],
      );
      set({ ...initial });
      void queryClient.invalidateQueries();
    },
  };
});
