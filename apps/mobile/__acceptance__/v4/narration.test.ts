// Pins v4 smoke defects 2 & 3 (checklists/v4-smoke.md): sequence cards must
// narrate their title like every other titled card, and joining narration
// segments must never produce ".." (audible stutter on device voices).
import { describe, expect, it } from 'vitest';
import { MISSIONS } from '@/content';
import { cardNarration, stepNarration } from '@/lib/narration';

function allSteps() {
  return MISSIONS.flatMap((m) => m.steps.map((step) => ({ missionId: m.missionId, step })));
}

describe('narration completeness', () => {
  it('sequence steps with a title narrate the title before the prompt', () => {
    const sequences = allSteps().filter(
      (s) => s.step.type === 'sequence' && 'title' in s.step && s.step.title,
    );
    expect(sequences.length, 'pack must contain a titled sequence step').toBeGreaterThan(0);
    for (const { missionId, step } of sequences) {
      if (step.type !== 'sequence' || !step.title) continue;
      const spoken = stepNarration(step);
      expect(spoken, `${missionId}/${step.id} narration must include the title`).toContain(
        step.title,
      );
      expect(
        spoken.indexOf(step.title),
        `${missionId}/${step.id} title must precede the prompt`,
      ).toBeLessThan(spoken.indexOf(step.prompt));
    }
  });
});

describe('narration hygiene', () => {
  it('no step in the pack narrates a doubled period', () => {
    for (const { missionId, step } of allSteps()) {
      expect(
        stepNarration(step),
        `${missionId}/${step.id} narration contains ".."`,
      ).not.toContain('..');
    }
  });

  it('no checkpoint question card narrates a doubled period', () => {
    for (const mission of MISSIONS) {
      for (const step of mission.steps) {
        if (step.type !== 'checkpoint') continue;
        step.questions.forEach((q, i) => {
          if ('bankRef' in q) return; // Route 1 is authored; bankRef cards resolve from the bank
          expect(
            cardNarration({
              kind: 'checkpoint-q',
              stepId: `${step.id}#q${i}`,
              conceptId: q.conceptId,
              question: { prompt: q.prompt, options: q.options, explanation: q.explanation },
            }),
            `${mission.missionId}/${step.id}#q${i} narration contains ".."`,
          ).not.toContain('..');
        });
      }
    }
  });
});
