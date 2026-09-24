import { describe, expect, it } from 'vitest';
import {
  buildPack,
  buildBank,
  selectAppBank,
  serializePack,
  BankFile,
  ContentPackSchema,
  ContentValidationError,
} from '../src';
import { goodContent, secondMission } from './fixtures';

const twoMissionContent = () => {
  const c = goodContent();
  c.missions.push({ file: 'route-1/mission-2.json', data: secondMission() });
  return c;
};

const isSortedAsc = (keys: string[]): boolean =>
  keys.every((k, i) => i === 0 || keys[i - 1]! < k);

const assertCanonicalKeys = (node: unknown, path: string): void => {
  if (Array.isArray(node)) {
    node.forEach((child, i) => assertCanonicalKeys(child, `${path}[${i}]`));
    return;
  }
  if (node !== null && typeof node === 'object') {
    const keys = Object.keys(node);
    expect(isSortedAsc(keys), `keys not sorted at ${path}: ${keys.join(',')}`).toBe(true);
    for (const k of keys) assertCanonicalKeys((node as Record<string, unknown>)[k], `${path}.${k}`);
  }
};

describe('buildPack — determinism', () => {
  it('two builds of the same content are byte-identical', () => {
    expect(buildPack(goodContent())).toBe(buildPack(goodContent()));
  });

  it('mission file order does not change the bytes', () => {
    const forward = buildPack(twoMissionContent());
    const reversed = twoMissionContent();
    reversed.missions.reverse();
    expect(buildPack(reversed)).toBe(forward);
  });

  it('object keys are recursively sorted and the file ends with a newline', () => {
    const bytes = buildPack(goodContent());
    expect(bytes.endsWith('\n')).toBe(true);
    assertCanonicalKeys(JSON.parse(bytes), '$');
  });
});

describe('buildPack — round-trip', () => {
  it('load → parse → serialize reproduces the exact bytes', () => {
    const bytes = buildPack(twoMissionContent());
    const pack = ContentPackSchema.parse(JSON.parse(bytes));
    expect(serializePack(pack)).toBe(bytes);
  });

  it('pack parses under ContentPackSchema with the expected shape', () => {
    const pack = ContentPackSchema.parse(JSON.parse(buildPack(twoMissionContent())));
    expect(pack.packFormat).toBe(1);
    expect(pack.routes).toHaveLength(7);
    expect(pack.routes.map((r) => r.routeId)).toEqual([
      'route-1',
      'route-2',
      'route-3',
      'route-4',
      'route-5',
      'route-6',
      'route-7',
    ]);
    expect(pack.routes[0]!.title).toBe('Road Basics');
    expect(pack.routes[0]!.missions.map((m) => m.missionId)).toEqual(['r1-m1', 'r1-m2']);
    for (const route of pack.routes.slice(1)) expect(route.missions).toEqual([]);
    const misconceptionIds = pack.misconceptions.map((m) => m.misconceptionId);
    expect(misconceptionIds).toEqual([...misconceptionIds].sort());
    expect(misconceptionIds).toContain('m.t.one');
    expect(Object.keys(pack.sourceRefs)).toContain('KYTS-1');
  });
});

describe('buildBank — app-facing pool bank', () => {
  const validCar = {
    item: 'AB1001',
    topic: 'alertness',
    routeId: 'route-1',
    conceptId: 'c.alertness.ab1001',
    prompt: 'A valid car question',
    options: [
      { id: 'a', text: 'right', correct: true },
      { id: 'b', text: 'wrong', correct: false },
    ],
    explanation: 'Because.',
    sourceRefs: ['HC-r1'],
    niExempt: false,
  };
  // Image option with no altText — the vB.1 alt-text-pending shape (invalid until vB.3).
  const pendingCar = {
    ...validCar,
    item: 'AB1002',
    conceptId: 'c.alertness.ab1002',
    options: [
      { id: 'a', imageRef: 'sign.gif', correct: true },
      { id: 'b', text: 'wrong', correct: false },
    ],
  };
  const validVmc = {
    item: 'VM9001-1',
    topic: 'Video scene',
    routeId: 'route-3',
    conceptId: 'c.video.vm9001-1',
    prompt: 'A valid video question',
    options: [
      { id: 'a', text: 'right', correct: true },
      { id: 'b', text: 'wrong', correct: false },
    ],
    explanation: 'Because.',
    sourceRefs: ['HC-r1'],
    niExempt: false,
    clipId: 'vm9001',
  };
  const carFile = { bankFormat: 1, source: 'x', questions: [validCar, pendingCar] };
  const vmcFile = { bankFormat: 1, source: 'x', questions: [validVmc] };

  it('keeps pool-eligible questions and drops the ones that fail BankQuestion parse', () => {
    const bank = selectAppBank(carFile, vmcFile);
    const items = bank.questions.map((q) => q.item);
    expect(items).toContain('AB1001');
    expect(items).toContain('VM9001-1');
    expect(items).not.toContain('AB1002'); // image option awaiting alt-text
  });

  it('merges car then video questions; video questions keep their clipId', () => {
    const bank = selectAppBank(carFile, vmcFile);
    expect(bank.bankFormat).toBe(1);
    expect(bank.questions.filter((q) => q.clipId).map((q) => q.clipId)).toEqual(['vm9001']);
  });

  it('is deterministic, canonical (key-sorted, trailing newline), and round-trips under BankFile', () => {
    const bytes = buildBank(carFile, vmcFile);
    expect(buildBank(carFile, vmcFile)).toBe(bytes);
    expect(bytes.endsWith('\n')).toBe(true);
    assertCanonicalKeys(JSON.parse(bytes), '$');
    const parsed = BankFile.parse(JSON.parse(bytes));
    expect(parsed.questions.map((q) => q.item)).toEqual(['AB1001', 'VM9001-1']);
  });

  it('tolerates a malformed file object (no questions array) as empty', () => {
    expect(selectAppBank({}, undefined).questions).toEqual([]);
  });
});

describe('buildPack — validation gate', () => {
  it('throws ContentValidationError when content has errors', () => {
    const c = goodContent();
    delete c.missions[0]!.data.steps[0]!.sourceRef;
    let caught: unknown;
    try {
      buildPack(c);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ContentValidationError);
    const err = caught as ContentValidationError;
    expect(err.message).toContain('content validation failed');
    expect(err.report.errors).toHaveLength(1);
    expect(err.report.errors[0]!.message).toBe('missing sourceRef');
  });

  it('does not throw on warnings alone', () => {
    const c = goodContent();
    delete c.missions[0]!.data.steps[0]!.question!.options[0]!.misconceptionId;
    expect(() => buildPack(c)).not.toThrow();
  });
});
