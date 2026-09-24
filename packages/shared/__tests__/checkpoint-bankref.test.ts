import { describe, expect, it } from 'vitest';
import {
  MissionSchema,
  resolveBankQuestionByConcept,
  unresolvedCheckpointBankRefs,
  type BankFile,
  type Mission,
} from '../src';
import { goodMission } from './fixtures';

// A synthetic, non-DVSA bank whose questions deliberately live in DIFFERENT routes/topics,
// so a checkpoint bankRef resolving one of them proves resolution is bank-wide + cross-topic
// (locked decision P0-1 — the topic-map only governs practice/mock quotas, never checkpoints).
function bank(): BankFile {
  const car = (item: string, topic: string, routeId: string, conceptId: string) => ({
    item,
    topic,
    routeId,
    conceptId,
    prompt: `Synthetic ${topic} question`,
    options: [
      { id: 'a' as const, text: 'right', correct: true },
      { id: 'b' as const, text: 'wrong', correct: false },
    ],
    explanation: `The official explanation for ${topic}.`,
    sourceRefs: ['HC-r1'],
    niExempt: false,
  });
  return {
    bankFormat: 1,
    source: 'synthetic',
    questions: [
      car('AB1001', 'signs', 'route-2', 'c.signs.ab1001'),
      car('AB1002', 'incidents', 'route-7', 'c.incidents.ab1002'),
      car('AB1003', 'motorway-rules', 'route-5', 'c.motorway-rules.ab1003'),
    ],
  };
}

// goodMission() lives in route-1; its checkpoint tests route-1 concepts. Swapping the
// checkpoint to bankRefs that point at route-2/5/7 bank concepts is exactly the cross-topic
// curation vB.4 enables — a mission checkpoint drawing bank-wide.
function missionWithBankRefCheckpoint(refs: string[]): Mission {
  const raw = goodMission();
  const checkpoint = raw.steps[raw.steps.length - 1];
  checkpoint.questions = refs.map((bankRef) => ({ bankRef })) as never;
  return MissionSchema.parse(raw);
}

describe('checkpoint bankRef — schema', () => {
  it('a checkpoint question may be an authored inline question (unchanged)', () => {
    const m = MissionSchema.parse(goodMission());
    const cp = m.steps[m.steps.length - 1];
    expect(cp.type).toBe('checkpoint');
    if (cp.type !== 'checkpoint') return;
    for (const q of cp.questions) expect('bankRef' in q).toBe(false);
  });

  it('a checkpoint question may be a bankRef reference (no inline prompt/options/sourceRef)', () => {
    const m = missionWithBankRefCheckpoint([
      'c.signs.ab1001',
      'c.incidents.ab1002',
      'c.motorway-rules.ab1003',
      'c.signs.ab1001',
      'c.incidents.ab1002',
    ]);
    const cp = m.steps[m.steps.length - 1];
    if (cp.type !== 'checkpoint') throw new Error('expected checkpoint');
    expect(cp.questions).toHaveLength(5);
    for (const q of cp.questions) {
      expect('bankRef' in q).toBe(true);
      if ('bankRef' in q) expect(q.bankRef).toMatch(/^c\./);
    }
  });

  it('rejects a checkpoint question that mixes bankRef with inline authored fields', () => {
    const raw = goodMission();
    const checkpoint = raw.steps[raw.steps.length - 1];
    checkpoint.questions = [
      { bankRef: 'c.signs.ab1001', prompt: 'x', options: [], explanation: 'y' },
    ] as never;
    expect(MissionSchema.safeParse(raw).success).toBe(false);
  });
});

describe('checkpoint bankRef — resolver (bank-wide, cross-topic)', () => {
  it('resolves a concept regardless of its topic or route', () => {
    const b = bank();
    expect(resolveBankQuestionByConcept(b, 'c.signs.ab1001')?.item).toBe('AB1001');
    expect(resolveBankQuestionByConcept(b, 'c.incidents.ab1002')?.item).toBe('AB1002');
    expect(resolveBankQuestionByConcept(b, 'c.motorway-rules.ab1003')?.item).toBe('AB1003');
  });

  it('returns undefined for a concept absent from the bank', () => {
    expect(resolveBankQuestionByConcept(bank(), 'c.absent.zz9999')).toBeUndefined();
  });
});

describe('checkpoint bankRef — build-time resolution against the bank', () => {
  it('reports no unresolved refs when every checkpoint bankRef resolves', () => {
    const mission = missionWithBankRefCheckpoint([
      'c.signs.ab1001',
      'c.incidents.ab1002',
      'c.motorway-rules.ab1003',
      'c.signs.ab1001',
      'c.incidents.ab1002',
    ]);
    expect(unresolvedCheckpointBankRefs([mission], bank())).toEqual([]);
  });

  it('flags a dangling bankRef with its mission/step/index location', () => {
    const mission = missionWithBankRefCheckpoint([
      'c.signs.ab1001',
      'c.incidents.ab1002',
      'c.does-not.exist9999',
      'c.signs.ab1001',
      'c.incidents.ab1002',
    ]);
    const unresolved = unresolvedCheckpointBankRefs([mission], bank());
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toMatchObject({
      missionId: 'r1-m1',
      index: 2,
      bankRef: 'c.does-not.exist9999',
    });
    expect(unresolved[0]!.stepId).toBe('r1-m1-s8');
  });

  it('ignores authored inline checkpoint questions (nothing to resolve)', () => {
    const mission = MissionSchema.parse(goodMission());
    expect(unresolvedCheckpointBankRefs([mission], bank())).toEqual([]);
  });
});
