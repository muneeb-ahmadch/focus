import { describe, expect, it } from 'vitest';
import { MISSIONS } from '@/content';
import snapshot from './fixtures/route1-content-snapshot.json';

// Order-insensitive distillation of mission content, mirroring the snapshot
// captured from main before the v3 conversion. Option order and option ids are
// deliberately excluded: de-biasing reorders them without touching meaning.

type Mission = (typeof MISSIONS)[number];
type Step = Mission['steps'][number];
type Question = Extract<Step, { type: 'rule_card' }>['question'];
type CheckpointQuestion = Extract<Step, { type: 'checkpoint' }>['questions'][number];

interface DistilledOption {
  text: string;
  correct: boolean;
  misconceptionId?: string;
}

const byText = (a: DistilledOption, b: DistilledOption): number =>
  a.text < b.text ? -1 : a.text > b.text ? 1 : 0;

function distillQuestion(q: Question | CheckpointQuestion): Record<string, unknown> {
  // A curated bankRef checkpoint question distills to just its reference. Route 1 is fully
  // authored (no bankRefs), so this branch never fires for the snapshot — the pin stays intact.
  if ('bankRef' in q) return { bankRef: q.bankRef };
  const options: DistilledOption[] = q.options
    .map((o) => ({
      text: o.text,
      correct: o.correct,
      ...(o.misconceptionId !== undefined ? { misconceptionId: o.misconceptionId } : {}),
    }))
    .sort(byText);
  return {
    prompt: q.prompt,
    explanation: q.explanation,
    options,
    ...('conceptId' in q ? { conceptId: q.conceptId, sourceRef: q.sourceRef } : {}),
  };
}

function distillStep(step: Step): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: step.id,
    type: step.type,
    conceptId: step.conceptId,
    sourceRef: step.sourceRef,
  };
  switch (step.type) {
    case 'rule_card':
      return { ...base, title: step.title, body: step.body, question: distillQuestion(step.question) };
    case 'scene_decision':
    case 'hazard_cue':
      return { ...base, scene: step.scene, question: distillQuestion(step.question) };
    case 'sign_meaning':
      return { ...base, sign: step.sign, question: distillQuestion(step.question) };
    case 'contrast':
      return { ...base, a: step.a, b: step.b, question: distillQuestion(step.question) };
    case 'sequence': {
      const textOf = new Map(step.items.map((i) => [i.id, i.text]));
      return {
        ...base,
        prompt: step.prompt,
        explanation: step.explanation,
        ordered: step.correctOrder.map((id) => textOf.get(id)),
        ...(step.title !== undefined ? { title: step.title } : {}),
      };
    }
    case 'misconception':
      return {
        ...base,
        wrongBelief: step.wrongBelief,
        repairNote: step.repairNote,
        question: distillQuestion(step.question),
      };
    case 'checkpoint':
      return { ...base, questions: step.questions.map(distillQuestion) };
  }
}

function distillMission(m: Mission): Record<string, unknown> {
  return {
    missionId: m.missionId,
    routeId: m.routeId,
    title: m.title,
    estimatedMinutes: m.estimatedMinutes,
    steps: m.steps.map(distillStep),
  };
}

describe('conversion integrity — pipeline output equals pre-conversion content', () => {
  it('route-1 pack content matches the snapshot captured from main', () => {
    const distilled = [...MISSIONS]
      .sort((a, b) => (a.missionId < b.missionId ? -1 : 1))
      .map(distillMission);
    expect(distilled).toEqual(snapshot);
  });
});
