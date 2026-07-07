import type { PlayerCard } from '@/stores/playerStore';

export interface PlanState {
  inRepair: boolean;
}

export interface PlayPlan {
  correct(card: PlayerCard, state: PlanState): boolean;
  confidence?(card: PlayerCard, state: PlanState): 'sure' | 'unsure' | 'easy' | 'okay';
}

interface DriveableState {
  active: boolean;
  phase: string;
  queue: PlayerCard[];
  index: number;
  inRepair: boolean;
  lastAnswer?: { correct: boolean };
  answer(input: string | string[]): void;
  confirmConfidence(c: 'sure' | 'unsure' | 'easy' | 'okay'): void;
  advance(): void;
}

export interface DriveableStore {
  getState(): DriveableState;
}

export const allCorrect: PlayPlan = { correct: () => true };

function questionOf(card: PlayerCard) {
  if (card.kind !== 'step') return card.question;
  const step = card.step;
  if (step.type === 'sequence' || step.type === 'checkpoint') return undefined;
  return step.question;
}

export function stepOnce(store: DriveableStore, plan: PlayPlan): boolean {
  const s = store.getState();
  if (!s.active) return false;
  if (s.phase === 'failed' || s.phase === 'drill-summary') return false;
  if (s.phase === 'checkpoint-intro' || s.phase === 'repair-intro') {
    s.advance();
    return true;
  }

  const card = s.queue[s.index];
  if (!card) throw new Error(`no card at index ${s.index} in phase ${s.phase}`);
  const planState: PlanState = { inRepair: s.inRepair };

  if (s.phase === 'card') {
    if (card.kind === 'step' && card.step.type === 'sequence') {
      const order = plan.correct(card, planState)
        ? card.step.correctOrder
        : [...card.step.correctOrder].reverse();
      s.answer(order);
      return true;
    }
    const question = questionOf(card);
    if (!question) throw new Error(`unanswerable card ${card.stepId}`);
    const want = plan.correct(card, planState);
    const option = question.options.find((o) => o.correct === want);
    if (!option) throw new Error(`no ${want ? 'correct' : 'wrong'} option on ${card.stepId}`);
    s.answer(option.id);
    return true;
  }

  if (s.phase === 'feedback') {
    if (s.lastAnswer?.correct) {
      s.confirmConfidence(plan.confidence?.(card, planState) ?? 'sure');
    } else {
      s.advance();
    }
    return true;
  }

  throw new Error(`driver cannot handle phase ${s.phase}`);
}

export function playToEnd(store: DriveableStore, plan: PlayPlan, maxSteps = 500): void {
  for (let i = 0; i < maxSteps; i++) {
    if (!stepOnce(store, plan)) return;
  }
  throw new Error(`mission did not terminate within ${maxSteps} driver steps`);
}

export function playUntil(
  store: DriveableStore,
  plan: PlayPlan,
  done: (s: { phase: string; index: number; inRepair: boolean }) => boolean,
  maxSteps = 500,
): void {
  for (let i = 0; i < maxSteps; i++) {
    const s = store.getState();
    if (done({ phase: s.phase, index: s.index, inRepair: s.inRepair })) return;
    if (!stepOnce(store, plan)) {
      throw new Error(`store terminated (phase ${store.getState().phase}) before condition met`);
    }
  }
  throw new Error(`condition not met within ${maxSteps} driver steps`);
}
