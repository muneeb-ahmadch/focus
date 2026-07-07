import { describe, expect, it } from 'vitest';
import type { ResumePayload } from '@/stores/playerStore';
import { parseResumePayload } from '@/stores/resumePayload';

const valid: ResumePayload = {
  phase: 'card',
  index: 3,
  answers: [
    { stepId: 'r1-m1-s2', conceptId: 'c.speed.nsl-sign', correct: false, confidence: 'unsure' },
  ],
  checkpointAnswers: [],
  inRepair: false,
  queueIds: ['r1-m1-s1', 'r1-m1-s2', 'r1-m1-s3', 'r1-m1-s4'],
};

describe('parseResumePayload (rule R1: validating parse with explicit fallback)', () => {
  it('round-trips a valid payload', () => {
    expect(parseResumePayload(JSON.stringify(valid))).toEqual(valid);
  });

  it('preserves optional originalCheckpointScore', () => {
    const withScore = { ...valid, inRepair: true, originalCheckpointScore: 0.6 };
    expect(parseResumePayload(JSON.stringify(withScore))?.originalCheckpointScore).toBe(0.6);
  });

  it.each([
    ['garbage', 'not json {{{'],
    ['empty object', '{}'],
    ['json null', 'null'],
    ['array', '[1,2,3]'],
    ['wrong index type', JSON.stringify({ ...valid, index: '3' })],
    ['unknown phase', JSON.stringify({ ...valid, phase: 'bogus' })],
    ['missing queueIds', JSON.stringify({ ...valid, queueIds: undefined })],
    ['non-string queue id', JSON.stringify({ ...valid, queueIds: [1, 2] })],
    ['malformed answer record', JSON.stringify({ ...valid, answers: [{ stepId: 1 }] })],
  ])('%s → undefined, never a throw', (_name, json) => {
    expect(parseResumePayload(json)).toBeUndefined();
  });

  it('null/undefined/empty input → undefined', () => {
    expect(parseResumePayload(null)).toBeUndefined();
    expect(parseResumePayload(undefined)).toBeUndefined();
    expect(parseResumePayload('')).toBeUndefined();
  });

  it('ignores unknown extra keys (forward compatibility)', () => {
    const extra = JSON.stringify({ ...valid, futureField: 42 });
    const parsed = parseResumePayload(extra);
    expect(parsed?.index).toBe(3);
    expect(parsed?.queueIds).toEqual(valid.queueIds);
  });
});
