import { describe, expect, it } from 'vitest';
import { buildPack, serializePack, ContentPackSchema, ContentValidationError } from '../src';
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
