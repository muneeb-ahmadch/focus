import { describe, expect, it } from 'vitest';
import { TopicMap, validateBank } from '../src';
import {
  answerToOptionId,
  carRowToQuestion,
  normalizeTopic,
  parseXRefs,
  slugify,
  vmcRowToQuestion,
  type Cells,
} from '../src/ingest';

// Synthetic topic-map — NOT the real one; the ingest transforms are content-agnostic and
// the licensed material never enters a tracked file.
const topicMap = TopicMap.parse({
  topicMapFormat: 1,
  variants: {
    'Safety and your vehicle/motorcycle': 'Safety and your vehicle',
    'Vehicle/motorcycle handling': 'Vehicle handling',
    'Vehicle/motorcycle loading': 'Vehicle loading',
  },
  topics: {
    Alertness: { routeId: 'route-1', slug: 'alertness' },
    'Road and traffic signs': { routeId: 'route-2', slug: 'signs' },
    'Vehicle handling': { routeId: 'route-3', slug: 'vehicle-handling' },
    'Safety and your vehicle': { routeId: 'route-7', slug: 'safety-and-your-vehicle' },
    'Vehicle loading': { routeId: 'route-7', slug: 'vehicle-loading' },
  },
});

// Column-letter keyed rows, exactly the shape the xlsx reader emits.
// Car: C answer · D stem · E "Mark one answer" · F–I text options · J explanation ·
//      L NI exempt · M stem gif · N–Q option gifs · W xrefs.
const carTextRow = (over: Cells = {}): Cells => ({
  A: 'AB2001',
  B: 'Alertness ', // trailing space — must be trimmed
  C: 'C',
  D: 'What should you do before making a U-turn?',
  E: 'Mark one answer',
  F: 'Give an arm signal',
  G: 'Select a higher gear than normal',
  H: 'Look over your shoulder for a final check',
  I: 'Sound your horn twice',
  J: 'Make sure the road is clear in both directions before you turn.',
  W: 'DES s4, 9, HC r159, 161',
  ...over,
});

// Car: I column omitted (option D), N–Q gifs set → all four options are images.
const carImageRow = (over: Cells = {}): Cells => ({
  A: 'AB2036',
  B: 'Road and traffic signs',
  C: 'A',
  D: 'Which sign means no entry?',
  E: 'Mark one answer',
  J: 'No entry is shown by a red circle with a white horizontal bar.',
  M: 'AB2036stem.gif',
  N: 'AB2036a.gif',
  O: 'AB2036b.gif',
  P: 'AB2036c.gif',
  Q: 'AB2036d.gif',
  W: 'KYTS p10',
  ...over,
});

// VMC: D stem · E–H text options · I explanation · J xrefs. Item is vm####-N.
const vmcRow = (over: Cells = {}): Cells => ({
  A: 'vm2016-1',
  B: 'Box junction', // scene name, NOT a canonical topic
  C: 'C',
  D: 'When are you allowed to wait on the yellow box markings?',
  E: 'When you are going straight on',
  F: 'When you are turning left',
  G: 'When you are turning right and only oncoming traffic stops you',
  H: 'Never',
  I: 'You may wait in a box junction to turn right when only oncoming traffic prevents it.',
  J: 'DES s6, HC r174, KYTS p80',
  ...over,
});

const imageSet = new Set([
  'AB2036stem.gif',
  'AB2036a.gif',
  'AB2036b.gif',
  'AB2036c.gif',
  'AB2036d.gif',
]);
const altTextAll = {
  'AB2036a.gif': 'A red circle with a white horizontal bar',
  'AB2036b.gif': 'A blue circle with a white upward arrow',
  'AB2036c.gif': 'A red-bordered warning triangle',
  'AB2036d.gif': 'A plain green rectangle',
};

describe('parseXRefs', () => {
  it('splits on commas and lets a bare number inherit the current source and type', () => {
    expect(parseXRefs('DES s4, 9, HC r159, 161')).toEqual([
      'DES-s4',
      'DES-s9',
      'HC-r159',
      'HC-r161',
    ]);
  });

  it('strips a leading BOM before the source word', () => {
    expect(parseXRefs('﻿DES s7, HC r300, KYTS p34')).toEqual(['DES-s7', 'HC-r300', 'KYTS-p34']);
  });

  it('expands an en-dash rule range', () => {
    expect(parseXRefs('DES s13, HC r113–115')).toEqual([
      'DES-s13',
      'HC-r113',
      'HC-r114',
      'HC-r115',
    ]);
  });

  it('expands a hyphen page range', () => {
    expect(parseXRefs('HC p152-153')).toEqual(['HC-p152', 'HC-p153']);
  });

  it('expands a bare-number range inheriting the current type', () => {
    expect(parseXRefs('HC r95, 96–97')).toEqual(['HC-r95', 'HC-r96', 'HC-r97']);
  });

  it('keeps an alphanumeric locator verbatim (no range)', () => {
    expect(parseXRefs('HC rH2')).toEqual(['HC-rH2']);
  });

  it('handles repeated source words and de-dupes, preserving first-seen order', () => {
    expect(parseXRefs('DES s6, DES s13, HC r124, HC r146')).toEqual([
      'DES-s6',
      'DES-s13',
      'HC-r124',
      'HC-r146',
    ]);
    expect(parseXRefs('DES s6, DES s6')).toEqual(['DES-s6']);
  });

  it('tolerates trailing whitespace/newlines', () => {
    expect(parseXRefs('DES s1, HC r91, 262\n')).toEqual(['DES-s1', 'HC-r91', 'HC-r262']);
  });

  it('returns an empty list for blank input', () => {
    expect(parseXRefs('')).toEqual([]);
    expect(parseXRefs(undefined)).toEqual([]);
  });

  it('every emitted ref satisfies the BankSourceRef shape', () => {
    const refs = parseXRefs('﻿DES s4, 10, HC r113–115, KYTS p80');
    for (const r of refs) expect(r).toMatch(/^(DES|HC|KYTS|TSRGD|DVSA)-[A-Za-z0-9.]+$/);
  });
});

describe('normalizeTopic', () => {
  it('trims a trailing space', () => {
    expect(normalizeTopic('Alertness ', topicMap)).toBe('Alertness');
  });

  it('merges all three /motorcycle variants to their canonical topic', () => {
    expect(normalizeTopic('Safety and your vehicle/motorcycle', topicMap)).toBe(
      'Safety and your vehicle',
    );
    expect(normalizeTopic('Vehicle/motorcycle handling', topicMap)).toBe('Vehicle handling');
    expect(normalizeTopic('Vehicle/motorcycle loading', topicMap)).toBe('Vehicle loading');
  });

  it('passes a canonical topic through unchanged', () => {
    expect(normalizeTopic('Road and traffic signs', topicMap)).toBe('Road and traffic signs');
  });
});

describe('answerToOptionId', () => {
  it('maps A–D to a–d', () => {
    expect(answerToOptionId('A')).toBe('a');
    expect(answerToOptionId('B')).toBe('b');
    expect(answerToOptionId('C')).toBe('c');
    expect(answerToOptionId('D')).toBe('d');
  });

  it('uppercases a lowercase answer letter', () => {
    expect(answerToOptionId('b')).toBe('b');
  });

  it('returns undefined for a missing/garbage letter', () => {
    expect(answerToOptionId(undefined)).toBeUndefined();
    expect(answerToOptionId('Z')).toBeUndefined();
  });
});

describe('slugify', () => {
  it('lowercases and dash-joins words', () => {
    expect(slugify('Box junction')).toBe('box-junction');
    expect(slugify('Rural railway crossing')).toBe('rural-railway-crossing');
  });
});

describe('carRowToQuestion — text question', () => {
  const q = carRowToQuestion(carTextRow(), topicMap);

  it('maps the canonical topic, route, and default conceptId', () => {
    expect(q.topic).toBe('Alertness');
    expect(q.routeId).toBe('route-1');
    expect(q.conceptId).toBe('c.alertness.ab2001');
  });

  it('marks exactly the answer-letter option correct', () => {
    expect(q.options.map((o) => o.correct)).toEqual([false, false, true, false]);
    expect(q.options.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(q.options.every((o) => typeof o.text === 'string' && o.imageRef === undefined)).toBe(true);
  });

  it('parses the XRefs column into structured source refs', () => {
    expect(q.sourceRefs).toEqual(['DES-s4', 'DES-s9', 'HC-r159', 'HC-r161']);
  });

  it('defaults niExempt to false when the NI column is empty', () => {
    expect(q.niExempt).toBe(false);
  });

  it('uppercases a lowercase answer letter', () => {
    const lower = carRowToQuestion(carTextRow({ C: 'b' }), topicMap);
    expect(lower.options.map((o) => o.correct)).toEqual([false, true, false, false]);
  });

  it('merges a /motorcycle topic variant and routes by the canonical topic', () => {
    const merged = carRowToQuestion(
      carTextRow({ A: 'AB3001', B: 'Vehicle/motorcycle handling' }),
      topicMap,
    );
    expect(merged.topic).toBe('Vehicle handling');
    expect(merged.routeId).toBe('route-3');
    expect(merged.conceptId).toBe('c.vehicle-handling.ab3001');
  });

  it.each([
    ['NI EXEMPT', true],
    ['NI Exempt', true],
    ['', false],
  ])('reads NI exemption "%s" as %s regardless of casing', (value, expected) => {
    expect(carRowToQuestion(carTextRow({ L: value }), topicMap).niExempt).toBe(expected);
  });

  it('passes validateBank against the topic-map with zero errors', () => {
    const bank = { bankFormat: 1, source: 'synthetic', questions: [q] };
    expect(validateBank(bank, topicMap, {}).errors).toEqual([]);
  });
});

describe('carRowToQuestion — image-option question', () => {
  it('detects image options from the gif columns and carries the stem image', () => {
    const q = carRowToQuestion(carImageRow(), topicMap, altTextAll);
    expect(q.stemImage).toBe('AB2036stem.gif');
    expect(q.options.map((o) => o.imageRef)).toEqual([
      'AB2036a.gif',
      'AB2036b.gif',
      'AB2036c.gif',
      'AB2036d.gif',
    ]);
    expect(q.options.every((o) => o.text === undefined)).toBe(true);
    expect(q.options[0].correct).toBe(true);
  });

  it('populates altText from the provided map and passes validateBank (rule 8)', () => {
    const q = carRowToQuestion(carImageRow(), topicMap, altTextAll);
    expect(q.options.map((o) => o.altText)).toEqual(Object.values(altTextAll));
    const bank = { bankFormat: 1, source: 'synthetic', questions: [q] };
    expect(validateBank(bank, topicMap, { images: imageSet }).errors).toEqual([]);
  });

  it('omits altText when it is not yet authored, so validateBank flags rule 8', () => {
    const q = carRowToQuestion(carImageRow(), topicMap, {});
    expect(q.options.every((o) => o.altText === undefined)).toBe(true);
    const bank = { bankFormat: 1, source: 'synthetic', questions: [q] };
    const report = validateBank(bank, topicMap, { images: imageSet });
    expect(report.errors.some((e) => e.message.includes('requires altText'))).toBe(true);
  });
});

describe('vmcRowToQuestion', () => {
  it('derives the clipId, scene-slug conceptId, and text options', () => {
    const q = vmcRowToQuestion(vmcRow());
    expect(q.clipId).toBe('vm2016');
    expect(q.conceptId).toBe('c.box-junction.vm2016-1');
    expect(q.topic).toBe('Box junction');
    expect(q.routeId).toMatch(/^route-\d+$/);
    expect(q.options.map((o) => o.correct)).toEqual([false, false, true, false]);
    expect(q.sourceRefs).toEqual(['DES-s6', 'HC-r174', 'KYTS-p80']);
    expect(q.niExempt).toBe(false);
  });

  it('a clip of exactly three questions passes validateBank in videoBank mode', () => {
    const questions = [1, 2, 3].map((n) =>
      vmcRowToQuestion(vmcRow({ A: `vm2016-${n}`, C: 'A' })),
    );
    const bank = { bankFormat: 1, source: 'synthetic', questions };
    expect(validateBank(bank, topicMap, { videoBank: true }).errors).toEqual([]);
  });
});
