import { describe, expect, it } from 'vitest';
import { validateContent, type ValidationReport } from '../src';
import { goodContent, goodMission, type RawContent } from './fixtures';

const expectError = (
  report: ValidationReport,
  issue: { file: string; where: string; message: string },
): void => {
  expect(
    report.errors.some(
      (e) => e.file === issue.file && e.where === issue.where && e.message === issue.message,
    ),
    `expected error ${JSON.stringify(issue)} in ${JSON.stringify(report.errors)}`,
  ).toBe(true);
};

const expectWarning = (
  report: ValidationReport,
  issue: { file: string; where: string; message: string },
): void => {
  expect(
    report.warnings.some(
      (w) => w.file === issue.file && w.where === issue.where && w.message === issue.message,
    ),
    `expected warning ${JSON.stringify(issue)} in ${JSON.stringify(report.warnings)}`,
  ).toBe(true);
};

const MISSION_FILE = 'route-1/mission-1.json';

describe('validateContent — clean content', () => {
  it('good content produces zero errors and zero warnings', () => {
    const report = validateContent(goodContent());
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('unicode and emoji in card bodies are valid', () => {
    const c = goodContent();
    const step = c.missions[0]!.data.steps[0]!;
    step.body = 'Circles 🚫 give orders — triangles ⚠️ warn.';
    step.question!.explanation = 'Naïve façade – emoji count as characters 🎯.';
    const report = validateContent(c);
    expect(report.errors).toEqual([]);
  });

  it('an empty route (no mission files) is valid', () => {
    const c = goodContent();
    c.missions = [];
    expect(validateContent(c).errors).toEqual([]);
  });
});

describe('validateContent — step-level errors', () => {
  it('missing sourceRef', () => {
    const c = goodContent();
    delete c.missions[0]!.data.steps[0]!.sourceRef;
    const report = validateContent(c);
    expectError(report, { file: MISSION_FILE, where: 'r1-m1-s1', message: 'missing sourceRef' });
    expect(report.errors).toHaveLength(1);
  });

  it('missing conceptId', () => {
    const c = goodContent();
    delete c.missions[0]!.data.steps[0]!.conceptId;
    const report = validateContent(c);
    expectError(report, { file: MISSION_FILE, where: 'r1-m1-s1', message: 'missing conceptId' });
    expect(report.errors).toHaveLength(1);
  });

  it('body over the 160-character cap', () => {
    const c = goodContent();
    c.missions[0]!.data.steps[0]!.body = 'x'.repeat(161);
    const report = validateContent(c);
    expectError(report, {
      file: MISSION_FILE,
      where: 'r1-m1-s1',
      message: 'body exceeds 160 characters',
    });
    expect(report.errors).toHaveLength(1);
  });

  it('explanation over the 160-character cap', () => {
    const c = goodContent();
    c.missions[0]!.data.steps[0]!.question!.explanation = 'x'.repeat(161);
    const report = validateContent(c);
    expectError(report, {
      file: MISSION_FILE,
      where: 'r1-m1-s1',
      message: 'explanation exceeds 160 characters',
    });
    expect(report.errors).toHaveLength(1);
  });

  it('unknown step type', () => {
    const c = goodContent();
    c.missions[0]!.data.steps[1]!.type = 'video_quiz';
    const report = validateContent(c);
    expectError(report, {
      file: MISSION_FILE,
      where: 'r1-m1-s2',
      message: 'unknown step type "video_quiz"',
    });
    expect(report.errors).toHaveLength(1);
  });

  it('checkpoint without questions', () => {
    const c = goodContent();
    c.missions[0]!.data.steps[7]!.questions = [];
    const report = validateContent(c);
    expectError(report, {
      file: MISSION_FILE,
      where: 'r1-m1-s8',
      message: 'checkpoint must have exactly 5 questions',
    });
    expect(report.errors).toHaveLength(1);
  });

  it('two correct options on one question', () => {
    const c = goodContent();
    c.missions[0]!.data.steps[0]!.question!.options[0]!.correct = true;
    const report = validateContent(c);
    expectError(report, {
      file: MISSION_FILE,
      where: 'r1-m1-s1',
      message: 'exactly one option must be correct',
    });
  });

  it('zero correct options on a checkpoint question', () => {
    const c = goodContent();
    const cp = c.missions[0]!.data.steps[7]!;
    const target = cp.questions![2]!;
    for (const o of target.options) o.correct = false;
    const report = validateContent(c);
    expectError(report, {
      file: MISSION_FILE,
      where: 'r1-m1-s8#q2',
      message: 'exactly one option must be correct',
    });
  });

  it('misconceptionId on a correct option', () => {
    const c = goodContent();
    c.missions[0]!.data.steps[0]!.question!.options[1]!.misconceptionId = 'm.t.one';
    const report = validateContent(c);
    expectError(report, {
      file: MISSION_FILE,
      where: 'r1-m1-s1',
      message: 'misconceptionId is only allowed on incorrect options',
    });
  });

  it('misconceptionId not present in misconceptions.json', () => {
    const c = goodContent();
    c.missions[0]!.data.steps[0]!.question!.options[0]!.misconceptionId = 'm.bogus.belief';
    const report = validateContent(c);
    expectError(report, {
      file: MISSION_FILE,
      where: 'r1-m1-s1',
      message: 'unknown misconceptionId "m.bogus.belief"',
    });
  });

  it('sourceRef not present in source-refs.json', () => {
    const c = goodContent();
    c.missions[0]!.data.steps[0]!.sourceRef = 'HC-999';
    const report = validateContent(c);
    expectError(report, {
      file: MISSION_FILE,
      where: 'r1-m1-s1',
      message: 'unknown sourceRef "HC-999"',
    });
  });

  it('duplicate step id within a mission', () => {
    const c = goodContent();
    c.missions[0]!.data.steps[1]!.id = 'r1-m1-s1';
    const report = validateContent(c);
    expectError(report, {
      file: MISSION_FILE,
      where: 'r1-m1',
      message: 'duplicate step id "r1-m1-s1"',
    });
  });

  it('sequence correctOrder is not a permutation of item ids', () => {
    const c = goodContent();
    c.missions[0]!.data.steps[4]!.correctOrder = ['a', 'b', 'b'];
    const report = validateContent(c);
    expectError(report, {
      file: MISSION_FILE,
      where: 'r1-m1-s5',
      message: 'correctOrder must be a permutation of item ids',
    });
  });

  it('checkpoint question on a concept no step teaches', () => {
    const c = goodContent();
    c.missions[0]!.data.steps[7]!.questions![1]!.conceptId = 'c.fake.concept';
    const report = validateContent(c);
    expectError(report, {
      file: MISSION_FILE,
      where: 'r1-m1-s8#q1',
      message: 'checkpoint concept "c.fake.concept" is not taught by any step in this mission',
    });
  });
});

describe('validateContent — mission-level errors', () => {
  it('checkpoint is not the last step', () => {
    const c = goodContent();
    const steps = c.missions[0]!.data.steps;
    [steps[6], steps[7]] = [steps[7]!, steps[6]!];
    const report = validateContent(c);
    expectError(report, {
      file: MISSION_FILE,
      where: 'r1-m1',
      message: 'mission must end with exactly one checkpoint step',
    });
  });

  it('mission with no checkpoint at all', () => {
    const c = goodContent();
    c.missions[0]!.data.steps = c.missions[0]!.data.steps.slice(0, 7);
    const report = validateContent(c);
    expectError(report, {
      file: MISSION_FILE,
      where: 'r1-m1',
      message: 'mission must end with exactly one checkpoint step',
    });
  });

  it('duplicate missionId across files', () => {
    const c = goodContent();
    c.missions.push({ file: 'route-1/mission-1-copy.json', data: goodMission() });
    const report = validateContent(c);
    expectError(report, {
      file: 'route-1/mission-1-copy.json',
      where: 'r1-m1',
      message: 'duplicate missionId "r1-m1"',
    });
  });

  it('routeId not defined in routes.json', () => {
    const c = goodContent();
    c.missions[0]!.data.routeId = 'route-9';
    const report = validateContent(c);
    expectError(report, {
      file: MISSION_FILE,
      where: 'r1-m1',
      message: 'routeId "route-9" is not in routes.json',
    });
  });

  it('mission file that is not a mission object', () => {
    const c = goodContent();
    (c.missions[0] as { data: unknown }).data = [];
    const report = validateContent(c);
    expectError(report, {
      file: MISSION_FILE,
      where: 'mission',
      message: 'mission file is not a valid mission object',
    });
  });
});

describe('validateContent — registry errors', () => {
  it('routes.json must define exactly routes 1–7', () => {
    const c = goodContent();
    c.routes = c.routes.slice(0, 6);
    const report = validateContent(c);
    expectError(report, {
      file: 'routes.json',
      where: 'routes',
      message: 'routes.json must define exactly route-1 through route-7',
    });
  });

  it('duplicate misconceptionId in the taxonomy', () => {
    const c = goodContent();
    c.misconceptions.push({ ...c.misconceptions[0]! });
    const report = validateContent(c);
    expectError(report, {
      file: 'misconceptions.json',
      where: 'm.t.one',
      message: 'duplicate misconceptionId "m.t.one"',
    });
  });

  it('misconception entry with an unregistered sourceRef', () => {
    const c = goodContent();
    c.misconceptions[0]!.sourceRef = 'HC-999';
    const report = validateContent(c);
    expectError(report, {
      file: 'misconceptions.json',
      where: 'm.t.one',
      message: 'unknown sourceRef "HC-999"',
    });
  });
});

describe('validateContent — warnings (never errors)', () => {
  it('question with zero misconception-tagged distractors warns', () => {
    const c = goodContent();
    delete c.missions[0]!.data.steps[0]!.question!.options[0]!.misconceptionId;
    const report = validateContent(c);
    expect(report.errors).toEqual([]);
    expectWarning(report, {
      file: MISSION_FILE,
      where: 'r1-m1-s1',
      message: 'no misconception-tagged distractor',
    });
    expect(report.warnings).toHaveLength(1);
  });

  it('every correct option authored first warns of positional answer bias', () => {
    const c = goodContent();
    const allQuestions = (m: RawContent['missions'][number]['data']): void => {
      for (const step of m.steps) {
        const qs = step.questions ?? (step.question ? [step.question] : []);
        for (const question of qs) {
          const i = question.options.findIndex((o) => o.correct);
          const [correct] = question.options.splice(i, 1);
          question.options.unshift(correct!);
        }
      }
    };
    allQuestions(c.missions[0]!.data);
    const report = validateContent(c);
    expect(report.errors).toEqual([]);
    expectWarning(report, {
      file: MISSION_FILE,
      where: 'r1-m1',
      message: 'positional answer bias: every correct option in "r1-m1" is authored first',
    });
  });

  it('taxonomy entry never referenced by any question warns', () => {
    const c = goodContent();
    c.misconceptions.push({
      misconceptionId: 'm.t.five',
      conceptId: 'c.t.golf',
      wrongBelief: 'Golf is optional.',
      repairNote: 'It is not.',
      sourceRef: 'HC-6',
    });
    const report = validateContent(c);
    expect(report.errors).toEqual([]);
    expectWarning(report, {
      file: 'misconceptions.json',
      where: 'm.t.five',
      message: 'misconception "m.t.five" is never referenced',
    });
  });
});
