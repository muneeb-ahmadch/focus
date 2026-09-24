import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BankFile, TopicMap, validateBank, type BankReport } from '../src';

const topicMap = TopicMap.parse({
  topicMapFormat: 1,
  variants: { 'Safety and your vehicle/motorcycle': 'Safety and your vehicle' },
  topics: {
    Alertness: { routeId: 'route-1', slug: 'alertness' },
    'Road and traffic signs': { routeId: 'route-2', slug: 'signs' },
  },
});

type Raw = Record<string, unknown>;

const textQ = (over: Raw = {}): Raw => ({
  item: 'AB2001',
  topic: 'Alertness',
  routeId: 'route-1',
  conceptId: 'c.alertness.ab2001',
  prompt: 'What should you do before making a U-turn?',
  options: [
    { id: 'a', text: 'Give an arm signal', correct: false },
    { id: 'b', text: 'Select a higher gear than normal', correct: false },
    { id: 'c', text: 'Look over your shoulder for a final check', correct: true },
    { id: 'd', text: 'Sound your horn twice', correct: false },
  ],
  explanation: 'Make sure the road is clear in both directions before you turn.',
  sourceRefs: ['DES-s4', 'HC-r159'],
  niExempt: false,
  ...over,
});

const imageQ = (over: Raw = {}): Raw => ({
  item: 'AB2036',
  topic: 'Road and traffic signs',
  routeId: 'route-2',
  conceptId: 'c.signs.ab2036',
  prompt: 'Which sign means no entry?',
  stemImage: 'AB2036.gif',
  options: [
    { id: 'a', imageRef: 'AB2036a.gif', altText: 'A red circle with a white horizontal bar', correct: true },
    { id: 'b', imageRef: 'AB2036b.gif', altText: 'A blue circle with a white arrow', correct: false },
    { id: 'c', imageRef: 'AB2036c.gif', altText: 'A red warning triangle', correct: false },
    { id: 'd', imageRef: 'AB2036d.gif', altText: 'A green rectangle', correct: false },
  ],
  explanation: 'No entry is shown by a red circle with a white horizontal bar.',
  sourceRefs: ['KYTS-p10'],
  niExempt: false,
  ...over,
});

const vmcQ = (n: number, over: Raw = {}): Raw => ({
  item: `vm2016-${n}`,
  topic: 'Box junction',
  routeId: 'route-4',
  conceptId: 'c.junctions.box',
  prompt: 'When are you allowed to wait on the yellow box markings?',
  clipId: 'vm2016',
  options: [
    { id: 'a', text: 'When you are going straight on', correct: false },
    { id: 'b', text: 'When you are turning left', correct: false },
    { id: 'c', text: 'When you are turning right and only oncoming traffic stops you', correct: true },
    { id: 'd', text: 'Never', correct: false },
  ],
  explanation: 'You may wait in a box junction to turn right when only oncoming traffic prevents it.',
  sourceRefs: ['HC-r174'],
  niExempt: false,
  ...over,
});

const bankOf = (...qs: Raw[]): Raw => ({ bankFormat: 1, source: 'Test bank', questions: qs });
const allImages = new Set(['AB2036.gif', 'AB2036a.gif', 'AB2036b.gif', 'AB2036c.gif', 'AB2036d.gif']);

const hasError = (report: BankReport, where: string, needle: string): boolean =>
  report.errors.some((e) => e.where === where && e.message.includes(needle));

describe('validateBank — clean banks pass', () => {
  it('a text + image car question bank with resolvable images has zero errors', () => {
    const report = validateBank(bankOf(textQ(), imageQ()), topicMap, { images: allImages });
    expect(report.errors).toEqual([]);
  });

  it('a VMC clip of exactly three questions has zero errors (topic not checked against topic-map)', () => {
    const report = validateBank(bankOf(vmcQ(1), vmcQ(2), vmcQ(3)), topicMap, { videoBank: true });
    expect(report.errors).toEqual([]);
  });

  it('BankFile schema parses a good bank round-trip', () => {
    expect(() => BankFile.parse(bankOf(textQ(), imageQ()))).not.toThrow();
  });
});

describe('validateBank — structural rejections', () => {
  it('duplicate item', () => {
    const r = validateBank(bankOf(textQ(), textQ()), topicMap, {});
    expect(hasError(r, 'AB2001', 'duplicate item')).toBe(true);
  });

  it('no correct option', () => {
    const q = textQ({ options: [
      { id: 'a', text: 'One', correct: false },
      { id: 'b', text: 'Two', correct: false },
      { id: 'c', text: 'Three', correct: false },
    ] });
    expect(hasError(validateBank(bankOf(q), topicMap, {}), 'AB2001', 'exactly one option must be correct')).toBe(true);
  });

  it('two correct options', () => {
    const q = textQ({ options: [
      { id: 'a', text: 'One', correct: true },
      { id: 'b', text: 'Two', correct: true },
      { id: 'c', text: 'Three', correct: false },
    ] });
    expect(hasError(validateBank(bankOf(q), topicMap, {}), 'AB2001', 'exactly one option must be correct')).toBe(true);
  });

  it('option with neither text nor imageRef', () => {
    const q = textQ({ options: [
      { id: 'a', correct: true },
      { id: 'b', text: 'Two', correct: false },
    ] });
    expect(hasError(validateBank(bankOf(q), topicMap, {}), 'AB2001', 'either text or imageRef')).toBe(true);
  });

  it('image option missing altText violates rule 8', () => {
    const q = imageQ({ options: [
      { id: 'a', imageRef: 'AB2036a.gif', correct: true },
      { id: 'b', imageRef: 'AB2036b.gif', altText: 'A blue circle', correct: false },
    ] });
    expect(hasError(validateBank(bankOf(q), topicMap, { images: allImages }), 'AB2036', 'requires altText')).toBe(true);
  });

  it('prompt over the 240 cap', () => {
    const q = textQ({ prompt: 'x'.repeat(241) });
    expect(validateBank(bankOf(q), topicMap, {}).errors.length).toBeGreaterThan(0);
  });
});

describe('validateBank — topic-map + routing', () => {
  it('topic absent from the topic-map', () => {
    const q = textQ({ topic: 'Underwater driving' });
    expect(hasError(validateBank(bankOf(q), topicMap, {}), 'AB2001', 'not a canonical topic')).toBe(true);
  });

  it('routeId that disagrees with the topic-map', () => {
    const q = textQ({ routeId: 'route-3' });
    expect(hasError(validateBank(bankOf(q), topicMap, {}), 'AB2001', 'does not match topic-map')).toBe(true);
  });
});

describe('validateBank — images + clips', () => {
  it('unresolved image ref', () => {
    const r = validateBank(bankOf(imageQ()), topicMap, { images: new Set(['AB2036.gif', 'AB2036a.gif']) });
    expect(hasError(r, 'AB2036', 'unresolved image')).toBe(true);
  });

  it('a VMC clip with only two questions', () => {
    const r = validateBank(bankOf(vmcQ(1), vmcQ(2)), topicMap, { videoBank: true });
    expect(hasError(r, 'vm2016', 'expected exactly 3')).toBe(true);
  });

  it('a VMC question missing its clipId', () => {
    const q = vmcQ(1, { clipId: undefined });
    expect(hasError(validateBank(bankOf(q, vmcQ(2), vmcQ(3)), topicMap, { videoBank: true }), 'vm2016-1', 'missing clipId')).toBe(true);
  });
});

describe('real topic-map.json', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = JSON.parse(readFileSync(join(here, '../../../content/topic-map.json'), 'utf8'));

  it('parses against the TopicMap schema', () => {
    expect(() => TopicMap.parse(raw)).not.toThrow();
  });

  it('maps 14 topics across all seven routes, and every variant points at a canonical topic', () => {
    const map = TopicMap.parse(raw);
    expect(Object.keys(map.topics)).toHaveLength(14);
    const routes = new Set(Object.values(map.topics).map((t) => t.routeId));
    expect([...routes].sort()).toEqual(['route-1', 'route-2', 'route-3', 'route-4', 'route-5', 'route-6', 'route-7']);
    for (const canonical of Object.values(map.variants)) {
      expect(map.topics[canonical], `variant target "${canonical}" must be a canonical topic`).toBeDefined();
    }
  });
});
