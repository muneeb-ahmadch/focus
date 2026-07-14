import { router } from 'expo-router';
import { create } from 'zustand';
import { getMission, getRouteManifest, pickDrillQuestion, pickScenarioQuestion } from '@/content';
import type { Mission, Question, Step } from '@focus/shared';
import { getDb } from '@/db';
import { addXp, bumpActivity, getActiveDays } from '@/db/repo/activity';
import { finishAttempt, recordAnswer, startAttempt } from '@/db/repo/attempts';
import { getTriggeredMisconception } from '@/db/repo/misconceptions';
import { completeMission, ensureMissionRow, failCheckpoint, saveResume } from '@/db/repo/missions';
import { applyGrade, clearItem, getDue, upsertMiss } from '@/db/repo/reviews';
import { getRouteState, recomputeRoute } from '@/db/repo/routes';
import { getMockPool } from '@/lib/mockPool';
import {
  gradeCheckpoint,
  computeStreak,
  drillXp,
  hitMilestone,
  missionXp,
  rehabOutcome,
  rehabXp,
} from '@focus/engine';
import { dayNumber, now, todayLocal } from '@/lib/clock';
import { queryClient } from '@/lib/queryClient';
import { rescheduleAll } from '@/notifications/scheduler';

export const SLOW_ANSWER_MS = 20_000;

export type Mode = 'mission' | 'drill' | 'rehab' | 'practice';
export type Phase =
  | 'card'
  | 'feedback'
  | 'checkpoint-intro'
  | 'repair-intro'
  | 'drill-summary'
  | 'rehab-summary'
  | 'practice-summary'
  | 'failed';

export type PlayerCard =
  | { kind: 'step'; stepId: string; conceptId: string; step: Step }
  | { kind: 'checkpoint-q'; stepId: string; conceptId: string; question: Question }
  | { kind: 'drill-q'; stepId: string; conceptId: string; question: Question };

export interface AnswerRecord {
  stepId: string;
  conceptId: string;
  correct: boolean;
  confidence: 'sure' | 'unsure';
  misconceptionId?: string;
}

export interface ResumePayload {
  phase: Phase;
  index: number;
  answers: AnswerRecord[];
  checkpointAnswers: AnswerRecord[];
  inRepair: boolean;
  originalCheckpointScore?: number;
  queueIds: string[];
  missedConcepts?: string[];
}

interface PlayerState {
  mode: Mode;
  missionId?: string;
  routeId?: string;
  attemptId?: number;
  queue: PlayerCard[];
  index: number;
  phase: Phase;
  answers: AnswerRecord[];
  checkpointAnswers: AnswerRecord[];
  inRepair: boolean;
  originalCheckpointScore?: number;
  lastAnswer?: { optionId: string; correct: boolean; misconceptionId?: string };
  missedConcepts: string[];
  drillCorrect: number;
  active: boolean;
  hintOptionId?: string;
  rehabConceptId?: string;
  rehabCleared: boolean;
  startMission(missionId: string, resume?: ResumePayload): void;
  startDrill(conceptIds?: string[]): void;
  startRehab(conceptId: string): void;
  startPractice(questionIds: string[], contentLabel: string): void;
  answer(input: string | string[]): void;
  confirmConfidence(c: 'sure' | 'unsure' | 'easy' | 'okay'): void;
  useHint(): void;
  advance(): void;
  abandon(): void;
  dismiss(): void;
}

function questionForCard(card: PlayerCard): Question | undefined {
  if (card.kind === 'step') {
    return card.step.type === 'sequence' || card.step.type === 'checkpoint'
      ? undefined
      : card.step.question;
  }
  return card.question;
}

function missionCards(mission: Mission): PlayerCard[] {
  const cards: PlayerCard[] = [];
  for (const step of mission.steps) {
    if (step.type === 'checkpoint') {
      step.questions.forEach((q, i) => {
        cards.push({
          kind: 'checkpoint-q',
          stepId: `${step.id}#q${i}`,
          conceptId: q.conceptId,
          question: { prompt: q.prompt, options: q.options, explanation: q.explanation },
        });
      });
    } else {
      cards.push({ kind: 'step', stepId: step.id, conceptId: step.conceptId, step });
    }
  }
  return cards;
}

function cardsFromIds(mission: Mission, ids: string[]): PlayerCard[] {
  const all = missionCards(mission);
  const byId = new Map(all.map((c) => [c.stepId, c]));
  const cards: PlayerCard[] = [];
  for (const id of ids) {
    const card = byId.get(id);
    if (card) cards.push(card);
  }
  return cards;
}

function routeInfo(routeId: string) {
  return getRouteManifest().find((r) => r.routeId === routeId);
}

const initial = {
  mode: 'mission' as Mode,
  missionId: undefined,
  routeId: undefined,
  attemptId: undefined,
  queue: [] as PlayerCard[],
  index: 0,
  phase: 'card' as Phase,
  answers: [] as AnswerRecord[],
  checkpointAnswers: [] as AnswerRecord[],
  inRepair: false,
  originalCheckpointScore: undefined,
  lastAnswer: undefined,
  missedConcepts: [] as string[],
  drillCorrect: 0,
  active: false,
  hintOptionId: undefined,
  rehabConceptId: undefined,
  rehabCleared: false,
};

export const usePlayerStore = create<PlayerState>((set, get) => {
  let hintUsedForCard = false;
  let cardShownAtMs = 0;
  let slowForCurrentAnswer = false;

  function presentCard(): void {
    cardShownAtMs = now().getTime();
    hintUsedForCard = false;
    set({ hintOptionId: undefined });
  }
  function persistResume(): void {
    const s = get();
    if (s.mode !== 'mission' || !s.missionId || !s.active) return;
    if (s.phase === 'failed' || s.phase === 'drill-summary') return;
    const payload: ResumePayload = {
      phase: s.phase,
      index: s.index,
      answers: s.answers,
      checkpointAnswers: s.checkpointAnswers,
      inRepair: s.inRepair,
      originalCheckpointScore: s.originalCheckpointScore,
      queueIds: s.queue.map((c) => c.stepId),
      missedConcepts: s.missedConcepts,
    };
    saveResume(getDb(), s.missionId, s.index, JSON.stringify(payload));
  }

  function recordAndTrack(record: AnswerRecord): void {
    const s = get();
    const db = getDb();
    if (s.attemptId !== undefined) recordAnswer(db, s.attemptId, record);
    const card = s.queue[s.index];
    const isCheckpointSegment = card?.kind === 'checkpoint-q' && !s.inRepair;
    set({
      answers: [...s.answers, record],
      checkpointAnswers: isCheckpointSegment
        ? [...s.checkpointAnswers, record]
        : s.checkpointAnswers,
    });
  }

  function addMiss(conceptId: string, origin: 'wrong' | 'unsure' | 'hint_heavy' | 'slow'): void {
    const s = get();
    upsertMiss(getDb(), conceptId, origin, todayLocal());
    if (!s.missedConcepts.includes(conceptId)) {
      set({ missedConcepts: [...s.missedConcepts, conceptId] });
    }
  }

  function finishMission(score: number): void {
    const s = get();
    const db = getDb();
    const missionId = s.missionId;
    const routeId = s.routeId;
    if (!missionId || !routeId) return;
    const today = todayLocal();
    const streakBefore = computeStreak(getActiveDays(db).map(dayNumber), dayNumber(today));
    if (s.attemptId !== undefined) {
      finishAttempt(db, s.attemptId, 'submitted', score, JSON.stringify({ answers: s.answers }));
    }
    completeMission(db, missionId, score);
    bumpActivity(db, today, 'missions_completed');
    const xpEarned = missionXp(score);
    addXp(db, today, xpEarned);
    const masteryBefore = getRouteState(db, routeId)?.mastery ?? 0;
    const info = routeInfo(routeId);
    if (info) recomputeRoute(db, routeId, info);
    const masteryAfter = getRouteState(db, routeId)?.mastery ?? 0;
    const streakAfter = computeStreak(getActiveDays(db).map(dayNumber), dayNumber(today));
    const milestone = hitMilestone(streakBefore, streakAfter);
    const newReviews = s.missedConcepts.length;
    void rescheduleAll(db);
    void queryClient.invalidateQueries();
    set({ ...initial });
    router.replace({
      pathname: '/mission-complete',
      params: {
        missionId,
        score: String(score),
        streak: String(streakAfter),
        milestone: milestone === null ? '' : String(milestone),
        masteryBefore: String(masteryBefore),
        masteryAfter: String(masteryAfter),
        newReviews: String(newReviews),
        missed: s.missedConcepts.join(','),
        xp: String(xpEarned),
      },
    });
  }

  function failMission(): void {
    const s = get();
    const db = getDb();
    const missionId = s.missionId;
    const routeId = s.routeId;
    if (!missionId || !routeId) return;
    const score = s.originalCheckpointScore ?? 0;
    if (s.attemptId !== undefined) {
      finishAttempt(db, s.attemptId, 'submitted', score, JSON.stringify({ answers: s.answers }));
    }
    failCheckpoint(db, missionId, score);
    const info = routeInfo(routeId);
    if (info) recomputeRoute(db, routeId, info);
    void rescheduleAll(db);
    void queryClient.invalidateQueries();
    set({ phase: 'failed' });
  }

  function finishDrill(): void {
    const s = get();
    const db = getDb();
    const today = todayLocal();
    const correct = s.answers.filter((a) => a.correct).length;
    const total = s.answers.length;
    if (s.attemptId !== undefined) {
      finishAttempt(
        db,
        s.attemptId,
        'submitted',
        total === 0 ? 0 : correct / total,
        JSON.stringify({ answers: s.answers }),
      );
    }
    s.answers.forEach(() => bumpActivity(db, today, 'reviews_cleared'));
    addXp(db, today, drillXp(correct));
    for (const route of getRouteManifest()) {
      if (route.totalMissions > 0) recomputeRoute(db, route.routeId, route);
    }
    void rescheduleAll(db);
    void queryClient.invalidateQueries();
    set({ phase: 'drill-summary', drillCorrect: correct });
  }

  function finishPractice(): void {
    const s = get();
    const db = getDb();
    const today = todayLocal();
    const correct = s.answers.filter((a) => a.correct).length;
    const total = s.answers.length;
    if (s.attemptId !== undefined) {
      finishAttempt(
        db,
        s.attemptId,
        'submitted',
        total === 0 ? 0 : correct / total,
        JSON.stringify({ answers: s.answers }),
      );
    }
    addXp(db, today, drillXp(correct));
    for (const route of getRouteManifest()) {
      if (route.totalMissions > 0) recomputeRoute(db, route.routeId, route);
    }
    void rescheduleAll(db);
    void queryClient.invalidateQueries();
    set({ phase: 'practice-summary', drillCorrect: correct });
  }

  function endRehab(): void {
    const s = get();
    const conceptId = s.rehabConceptId;
    if (!conceptId) return;
    const db = getDb();
    const today = todayLocal();
    const outcome = rehabOutcome(s.answers.map((a) => ({ correct: a.correct, confidence: a.confidence })));
    if (outcome.cleared) {
      clearItem(db, conceptId, today);
      bumpActivity(db, today, 'reviews_cleared');
      addXp(db, today, rehabXp(true));
    } else {
      applyGrade(db, conceptId, outcome.grade, today);
    }
    const correct = s.answers.filter((a) => a.correct).length;
    const total = s.answers.length;
    if (s.attemptId !== undefined) {
      finishAttempt(db, s.attemptId, 'submitted', correct / total, JSON.stringify({ answers: s.answers }));
    }
    void queryClient.invalidateQueries();
    set({ phase: 'rehab-summary', rehabCleared: outcome.cleared });
  }

  function buildRepairQueue(mission: Mission, missedConceptIds: string[]): PlayerCard[] {
    const cards: PlayerCard[] = [];
    for (const step of mission.steps) {
      if (step.type === 'checkpoint') continue;
      if (missedConceptIds.includes(step.conceptId)) {
        cards.push({ kind: 'step', stepId: step.id, conceptId: step.conceptId, step });
      }
    }
    const s = get();
    const wrongIds = new Set(s.checkpointAnswers.filter((a) => !a.correct).map((a) => a.stepId));
    for (const card of missionCards(mission)) {
      if (card.kind === 'checkpoint-q' && wrongIds.has(card.stepId)) cards.push(card);
    }
    return cards;
  }

  return {
    ...initial,

    startMission(missionId, resume) {
      const mission = getMission(missionId);
      if (!mission) return;
      const db = getDb();
      ensureMissionRow(db, missionId, mission.routeId);
      const attemptId = startAttempt(db, 'lesson', missionId);
      if (resume) {
        const queue = cardsFromIds(mission, resume.queueIds);
        const resumeIsValid =
          queue.length === resume.queueIds.length && queue.length > 0 && resume.index < queue.length;
        if (resumeIsValid) {
          set({
            ...initial,
            mode: 'mission',
            missionId,
            routeId: mission.routeId,
            attemptId,
            queue,
            index: resume.index,
            phase: resume.phase === 'feedback' ? 'card' : resume.phase,
            answers: resume.answers,
            checkpointAnswers: resume.checkpointAnswers,
            inRepair: resume.inRepair,
            originalCheckpointScore: resume.originalCheckpointScore,
            missedConcepts: resume.missedConcepts ?? [],
            active: true,
          });
          presentCard();
          return;
        }
      }
      set({
        ...initial,
        mode: 'mission',
        missionId,
        routeId: mission.routeId,
        attemptId,
        queue: missionCards(mission),
        index: 0,
        phase: 'card',
        active: true,
      });
      presentCard();
      persistResume();
    },

    startDrill(conceptIds) {
      const db = getDb();
      const queue: PlayerCard[] = [];
      if (conceptIds) {
        for (const conceptId of conceptIds) {
          const dq = pickDrillQuestion(conceptId);
          if (dq) {
            queue.push({ kind: 'drill-q', stepId: dq.stepId, conceptId, question: dq.question });
          }
        }
      } else {
        const due = getDue(db, todayLocal()).slice(0, 10);
        for (const item of due) {
          const dq = pickDrillQuestion(item.concept_id);
          if (dq) {
            queue.push({
              kind: 'drill-q',
              stepId: dq.stepId,
              conceptId: item.concept_id,
              question: dq.question,
            });
          }
        }
      }
      const attemptId = startAttempt(db, 'drill', conceptIds ? 'fresh-drill' : 'daily-drill');
      set({
        ...initial,
        mode: 'drill',
        attemptId,
        queue,
        index: 0,
        phase: 'card',
        active: true,
      });
      presentCard();
    },

    startRehab(conceptId) {
      const recall = pickDrillQuestion(conceptId);
      if (!recall) return;
      const db = getDb();
      const triggered = getTriggeredMisconception(db, conceptId);
      const recallCard: PlayerCard = triggered
        ? {
            kind: 'step',
            stepId: `miscon:${triggered.misconception_id}`,
            conceptId,
            step: {
              id: `miscon:${triggered.misconception_id}`,
              conceptId,
              sourceRef: triggered.source_ref,
              type: 'misconception',
              wrongBelief: triggered.wrong_belief,
              question: recall.question,
              repairNote: triggered.repair_note,
            },
          }
        : { kind: 'drill-q', stepId: recall.stepId, conceptId, question: recall.question };
      const scenario = pickScenarioQuestion(conceptId);
      const queue: PlayerCard[] = [recallCard];
      if (scenario && scenario.stepId !== recall.stepId) {
        queue.push({ kind: 'drill-q', stepId: scenario.stepId, conceptId, question: scenario.question });
      }
      const attemptId = startAttempt(db, 'drill', `rehab:${conceptId}`);
      set({
        ...initial,
        mode: 'rehab',
        attemptId,
        queue,
        index: 0,
        phase: 'card',
        rehabConceptId: conceptId,
        rehabCleared: false,
        active: true,
      });
      presentCard();
    },

    startPractice(questionIds, contentLabel) {
      const { questionById } = getMockPool();
      const queue: PlayerCard[] = [];
      for (const id of questionIds) {
        const q = questionById.get(id);
        if (!q) continue;
        queue.push({
          kind: 'drill-q',
          stepId: id,
          conceptId: q.conceptId,
          question: { prompt: q.prompt, options: q.options, explanation: q.explanation },
        });
      }
      const db = getDb();
      const attemptId = startAttempt(db, 'practice', contentLabel);
      set({
        ...initial,
        mode: 'practice',
        attemptId,
        queue,
        index: 0,
        phase: 'card',
        active: true,
      });
      presentCard();
    },

    answer(input) {
      const s = get();
      if (s.phase !== 'card') return;
      const card = s.queue[s.index];
      if (!card) return;

      if (card.kind === 'step' && card.step.type === 'sequence') {
        const sequenceStep = card.step;
        const order = Array.isArray(input) ? input : [input];
        const correct =
          order.length === sequenceStep.correctOrder.length &&
          order.every((id, i) => id === sequenceStep.correctOrder[i]);
        slowForCurrentAnswer = now().getTime() - cardShownAtMs >= SLOW_ANSWER_MS;
        set({ phase: 'feedback', lastAnswer: { optionId: order.join(','), correct } });
        if (!correct) {
          recordAndTrack({
            stepId: card.stepId,
            conceptId: card.conceptId,
            correct: false,
            confidence: 'unsure',
          });
          if (s.mode === 'mission') addMiss(card.conceptId, 'wrong');
          else if (s.mode === 'drill') applyGrade(getDb(), card.conceptId, 'wrong', todayLocal());
        }
        return;
      }

      const question = questionForCard(card);
      if (!question) return;
      const optionId = Array.isArray(input) ? input[0] : input;
      const option = question.options.find((o) => o.id === optionId);
      if (!option) return;
      slowForCurrentAnswer = now().getTime() - cardShownAtMs >= SLOW_ANSWER_MS;
      set({
        phase: 'feedback',
        lastAnswer: {
          optionId: option.id,
          correct: option.correct,
          misconceptionId: option.misconceptionId,
        },
      });
      if (!option.correct) {
        recordAndTrack({
          stepId: card.stepId,
          conceptId: card.conceptId,
          correct: false,
          confidence: 'unsure',
          misconceptionId: option.misconceptionId,
        });
        if (s.mode === 'mission' || s.mode === 'practice') addMiss(card.conceptId, 'wrong');
        else if (s.mode === 'drill') applyGrade(getDb(), card.conceptId, 'wrong', todayLocal());
      } else if (s.mode === 'practice') {
        recordAndTrack({
          stepId: card.stepId,
          conceptId: card.conceptId,
          correct: true,
          confidence: 'sure',
        });
      }
    },

    confirmConfidence(c) {
      const s = get();
      if (s.phase !== 'feedback' || !s.lastAnswer?.correct || s.mode === 'practice') return;
      const card = s.queue[s.index];
      if (!card) return;
      const confidence = c === 'unsure' ? 'unsure' : 'sure';
      recordAndTrack({
        stepId: card.stepId,
        conceptId: card.conceptId,
        correct: true,
        confidence,
      });
      if (s.mode === 'mission') {
        if (hintUsedForCard) addMiss(card.conceptId, 'hint_heavy');
        else if (c === 'unsure') addMiss(card.conceptId, 'unsure');
        else if (slowForCurrentAnswer) addMiss(card.conceptId, 'slow');
      } else if (s.mode === 'drill') {
        applyGrade(getDb(), card.conceptId, c === 'sure' ? 'okay' : c, todayLocal());
      }
      get().advance();
    },

    useHint() {
      const s = get();
      if (s.phase !== 'card' || s.mode !== 'mission' || s.hintOptionId) return;
      const card = s.queue[s.index];
      if (!card || card.kind !== 'step') return;
      const question = questionForCard(card);
      if (!question || question.options.length < 3) return;
      const wrongOption = question.options.find((o) => o.correct === false);
      if (!wrongOption) return;
      hintUsedForCard = true;
      set({ hintOptionId: wrongOption.id });
    },

    advance() {
      const s = get();

      if (s.phase !== 'feedback' && s.phase !== 'checkpoint-intro' && s.phase !== 'repair-intro') {
        return;
      }

      if (s.phase === 'checkpoint-intro' || s.phase === 'repair-intro') {
        set({ phase: 'card', lastAnswer: undefined });
        presentCard();
        persistResume();
        return;
      }

      if (s.mode === 'rehab' && s.lastAnswer?.correct === false) {
        endRehab();
        return;
      }

      const card = s.queue[s.index];
      const wasWrongRequizInRepair =
        s.inRepair && card?.kind === 'checkpoint-q' && s.lastAnswer?.correct === false;
      if (wasWrongRequizInRepair) {
        failMission();
        return;
      }

      const nextIndex = s.index + 1;

      if (nextIndex >= s.queue.length) {
        if (s.mode === 'rehab') {
          endRehab();
          return;
        }
        if (s.mode === 'drill') {
          finishDrill();
          return;
        }
        if (s.mode === 'practice') {
          finishPractice();
          return;
        }
        if (!s.inRepair) {
          const result = gradeCheckpoint(
            s.checkpointAnswers.map((a) => ({ conceptId: a.conceptId, correct: a.correct })),
          );
          if (result.passed) {
            finishMission(result.score);
            return;
          }
          const mission = s.missionId ? getMission(s.missionId) : undefined;
          if (!mission) return;
          const repairQueue = buildRepairQueue(mission, result.missedConceptIds);
          set({
            inRepair: true,
            originalCheckpointScore: result.score,
            queue: repairQueue,
            index: 0,
            phase: 'repair-intro',
            lastAnswer: undefined,
          });
          persistResume();
          return;
        }
        finishMission(s.originalCheckpointScore ?? 0);
        return;
      }

      const nextCard = s.queue[nextIndex];
      const enteringCheckpoint =
        s.mode === 'mission' &&
        !s.inRepair &&
        nextCard?.kind === 'checkpoint-q' &&
        card?.kind !== 'checkpoint-q';
      set({
        index: nextIndex,
        phase: enteringCheckpoint ? 'checkpoint-intro' : 'card',
        lastAnswer: undefined,
      });
      if (!enteringCheckpoint) presentCard();
      persistResume();
    },

    abandon() {
      const s = get();
      if (s.mode === 'mission') persistResume();
      const db = getDb();
      if (s.attemptId !== undefined) finishAttempt(db, s.attemptId, 'abandoned', null, null);
      void queryClient.invalidateQueries();
      set({ ...initial });
    },

    dismiss() {
      const s = get();
      if (
        s.phase !== 'drill-summary' &&
        s.phase !== 'rehab-summary' &&
        s.phase !== 'practice-summary' &&
        s.phase !== 'failed'
      )
        return;
      set({ ...initial });
    },
  };
});
