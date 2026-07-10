import type { Step } from '@focus/shared';
import type { PlayerCard } from '@/stores/playerStore';

function join(parts: Array<string | undefined>): string {
  const clean = parts.map((p) => p?.trim()).filter((p): p is string => !!p);
  return clean
    .map((p, i) => (i === clean.length - 1 || /[.!?:]$/.test(p) ? p : `${p}.`))
    .join(' ');
}

export function stepNarration(step: Step): string {
  switch (step.type) {
    case 'rule_card':
      return join([step.title, step.body, step.question.prompt]);
    case 'scene_decision':
    case 'hazard_cue':
      return join([step.scene, step.question.prompt]);
    case 'sign_meaning':
      return step.question.prompt;
    case 'contrast':
      return join([
        `${step.a.label}: ${step.a.body}`,
        `${step.b.label}: ${step.b.body}`,
        step.question.prompt,
      ]);
    case 'sequence':
      return join([step.title, step.prompt]);
    case 'misconception':
      return join([`Some people think: ${step.wrongBelief}`, step.question.prompt]);
    case 'checkpoint':
      return '';
  }
}

export function cardNarration(card: PlayerCard): string {
  if (card.kind !== 'step') return card.question.prompt;
  return stepNarration(card.step);
}
