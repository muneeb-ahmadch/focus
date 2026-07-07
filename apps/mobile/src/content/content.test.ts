import { describe, expect, it } from 'vitest';
import { MISSIONS } from './index';
import { MissionSchema, type Mission, type Question } from './schema';
import rawMission1 from './route-1/mission-1.json';
import rawMission2 from './route-1/mission-2.json';
import rawMission3 from './route-1/mission-3.json';
import rawMission4 from './route-1/mission-4.json';
import rawMission5 from './route-1/mission-5.json';

const RAW_FILES: [string, unknown][] = [
  ['mission-1.json', rawMission1],
  ['mission-2.json', rawMission2],
  ['mission-3.json', rawMission3],
  ['mission-4.json', rawMission4],
  ['mission-5.json', rawMission5],
];

const allQuestions = (m: Mission): { where: string; q: Question }[] => {
  const out: { where: string; q: Question }[] = [];
  for (const step of m.steps) {
    if (step.type === 'checkpoint') {
      step.questions.forEach((q, i) => out.push({ where: `${step.id}#q${i}`, q }));
    } else if (step.type !== 'sequence') {
      out.push({ where: step.id, q: step.question });
    }
  }
  return out;
};

describe('content validator', () => {
  it('every route-1 mission file parses against MissionSchema', () => {
    for (const [file, raw] of RAW_FILES) {
      const result = MissionSchema.safeParse(raw);
      expect(result.success, `${file}: ${result.success ? '' : result.error.message}`).toBe(true);
    }
  });

  it('exactly one checkpoint per mission, and it is the last step', () => {
    for (const m of MISSIONS) {
      const checkpoints = m.steps.filter((s) => s.type === 'checkpoint');
      expect(checkpoints, m.missionId).toHaveLength(1);
      expect(m.steps[m.steps.length - 1]?.type, m.missionId).toBe('checkpoint');
    }
  });

  it('step ids unique within a mission; mission ids unique across files', () => {
    for (const m of MISSIONS) {
      const ids = m.steps.map((s) => s.id);
      expect(new Set(ids).size, m.missionId).toBe(ids.length);
    }
    const missionIds = MISSIONS.map((m) => m.missionId);
    expect(new Set(missionIds).size).toBe(missionIds.length);
  });

  it("every checkpoint question's conceptId appears on a teaching step of the same mission", () => {
    for (const m of MISSIONS) {
      const teachingConcepts = new Set(
        m.steps.filter((s) => s.type !== 'checkpoint').map((s) => s.conceptId),
      );
      for (const step of m.steps) {
        if (step.type !== 'checkpoint') continue;
        for (const q of step.questions) {
          expect(
            teachingConcepts.has(q.conceptId),
            `${m.missionId}: checkpoint concept ${q.conceptId} has no teaching step`,
          ).toBe(true);
        }
      }
    }
  });

  it('all 8 step types appear at least once across the 5 missions', () => {
    const types = new Set(MISSIONS.flatMap((m) => m.steps.map((s) => s.type)));
    expect([...types].sort()).toEqual(
      [
        'checkpoint',
        'contrast',
        'hazard_cue',
        'misconception',
        'rule_card',
        'scene_decision',
        'sequence',
        'sign_meaning',
      ].sort(),
    );
  });

  it("authoring convention: the correct option is always id 'a'", () => {
    for (const m of MISSIONS) {
      for (const { where, q } of allQuestions(m)) {
        const correct = q.options.find((o) => o.correct);
        expect(correct?.id, `${m.missionId} ${where}`).toBe('a');
      }
    }
  });

  it('pinning: mission-1 structure is the Appendix A transcription', () => {
    const m1 = MISSIONS.find((m) => m.missionId === 'r1-m1');
    expect(m1).toBeDefined();
    if (!m1) return;
    expect(m1.steps.map((s) => s.id)).toEqual([
      'r1-m1-s1',
      'r1-m1-s2',
      'r1-m1-s3',
      'r1-m1-s4',
      'r1-m1-s5',
      'r1-m1-s6',
      'r1-m1-s7',
      'r1-m1-s8',
    ]);
    expect(m1.steps.map((s) => s.type)).toEqual([
      'rule_card',
      'contrast',
      'sign_meaning',
      'rule_card',
      'scene_decision',
      'misconception',
      'hazard_cue',
      'checkpoint',
    ]);
    for (const { where, q } of allQuestions(m1)) {
      expect(q.options.find((o) => o.correct)?.id, where).toBe('a');
    }
    const checkpoint = m1.steps[m1.steps.length - 1];
    expect(checkpoint?.type).toBe('checkpoint');
    if (checkpoint?.type !== 'checkpoint') return;
    expect(checkpoint.questions.map((q) => q.conceptId)).toEqual([
      'c.signs.shape-grammar',
      'c.speed.nsl-sign',
      'c.speed.default-limits',
      'c.speed.limit-is-limit',
      'c.hazard.parked-cars',
    ]);
  });

  it('pinning: mission-2 contains the Appendix B sequence step verbatim', () => {
    const m2 = MISSIONS.find((m) => m.missionId === 'r1-m2');
    const step = m2?.steps.find((s) => s.id === 'r1-m2-s2');
    expect(step).toEqual({
      id: 'r1-m2-s2',
      type: 'sequence',
      conceptId: 'c.stopping.components',
      sourceRef: 'HC-126',
      title: 'What stopping is made of',
      prompt: 'Put your stop in the order it happens:',
      items: [
        { id: 'a', text: 'You spot the hazard' },
        { id: 'b', text: 'Thinking distance — you react, the car keeps moving' },
        { id: 'c', text: 'Braking distance — the brakes slow the car to a stop' },
      ],
      correctOrder: ['a', 'b', 'c'],
      explanation: 'Overall stopping distance = thinking distance + braking distance.',
    });
  });

  it("all missions ship reviewStatus 'draft' in v1", () => {
    for (const m of MISSIONS) {
      expect(m.reviewStatus, m.missionId).toBe('draft');
    }
  });

  it('warn-only: count questions with zero misconception-tagged distractors', () => {
    let untagged = 0;
    for (const m of MISSIONS) {
      for (const { where, q } of allQuestions(m)) {
        if (!q.options.some((o) => !o.correct && o.misconceptionId)) {
          untagged += 1;
          console.warn(`[content] no misconception-tagged distractor: ${m.missionId} ${where}`);
        }
      }
    }
    console.warn(`[content] questions without a misconception-tagged distractor: ${untagged}`);
    expect(untagged).toBeGreaterThanOrEqual(0);
  });
});
