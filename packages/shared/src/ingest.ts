import type { BankQuestion } from './bank';
import type { TopicMap } from './bank';

// A worksheet row as produced by the xlsx reader: values keyed by column letter (A, B, …).
export type Cells = Record<string, string | undefined>;

type OptionId = 'a' | 'b' | 'c' | 'd';
type BankOption = BankQuestion['options'][number];

// The validator's message for an unauthored image option (rule 8). vB.1 emits these image
// options without altText on purpose — vB.3 authors the ~108 lines; until then those
// questions fail validation and stay out of pools. Kept in sync with bank.ts.
export const ALT_TEXT_PENDING_NEEDLE = 'requires altText';

const SOURCE = /^(DES|HC|KYTS|TSRGD|DVSA)$/i;
const RANGE = /^(\d+)[-–—](\d+)$/;

function trim(value: string | undefined): string {
  return (value ?? '').replace(/﻿/g, '').trim();
}

// "DES s4, 9, HC r159, 161" → ["DES-s4","DES-s9","HC-r159","HC-r161"]. A source word sets
// the current source; a "typeNNN" token (s4/r159/p80/rH2) sets the current type; a bare
// number inherits both. Numeric ranges (r113–115, p152-153, bare 96–97) expand. De-duped,
// first-seen order preserved.
export function parseXRefs(raw: string | undefined): string[] {
  const words = (raw ?? '').replace(/﻿/g, '').split(/[\s,]+/).filter(Boolean);
  const refs: string[] = [];
  const seen = new Set<string>();
  let source: string | undefined;
  let type: string | undefined;

  const emit = (locator: string): void => {
    if (!source || !type) return;
    const range = RANGE.exec(locator);
    const parts = range ? expandRange(range[1]!, range[2]!) : [locator];
    for (const p of parts) {
      const ref = `${source}-${type}${p}`;
      if (!seen.has(ref)) {
        seen.add(ref);
        refs.push(ref);
      }
    }
  };

  for (const word of words) {
    if (SOURCE.test(word)) {
      source = word.toUpperCase();
    } else if (/^[a-zA-Z]/.test(word)) {
      type = word[0]!.toLowerCase();
      emit(word.slice(1));
    } else {
      emit(word);
    }
  }
  return refs;
}

function expandRange(startStr: string, endStr: string): string[] {
  const start = Number(startStr);
  const end = Number(endStr);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start || end - start > 50) {
    return [`${startStr}-${endStr}`];
  }
  const out: string[] = [];
  for (let n = start; n <= end; n += 1) out.push(String(n));
  return out;
}

// Canonical topic: trim trailing space, then fold /motorcycle variants via the topic-map.
export function normalizeTopic(raw: string | undefined, topicMap: TopicMap): string {
  const t = trim(raw);
  return topicMap.variants[t] ?? t;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function answerToOptionId(letter: string | undefined): OptionId | undefined {
  const l = trim(letter).toUpperCase();
  return l === 'A' || l === 'B' || l === 'C' || l === 'D'
    ? (l.toLowerCase() as OptionId)
    : undefined;
}

const CAR_OPTION_COLUMNS: { id: OptionId; text: string; gif: string }[] = [
  { id: 'a', text: 'F', gif: 'N' },
  { id: 'b', text: 'G', gif: 'O' },
  { id: 'c', text: 'H', gif: 'P' },
  { id: 'd', text: 'I', gif: 'Q' },
];

const VMC_OPTION_COLUMNS: { id: OptionId; text: string }[] = [
  { id: 'a', text: 'E' },
  { id: 'b', text: 'F' },
  { id: 'c', text: 'G' },
  { id: 'd', text: 'H' },
];

function imageOption(id: OptionId, gif: string, correct: boolean, altText?: Record<string, string>): BankOption {
  const at = altText?.[gif];
  return { id, imageRef: gif, correct, ...(at ? { altText: at } : {}) };
}

function textOption(id: OptionId, text: string, correct: boolean): BankOption {
  return { id, text, correct };
}

// Car sheet row → BankQuestion. Options are images when their gif column (N–Q) is set, else
// text (F–I). altText is looked up per gif filename; absent → omitted (rule-8 gap surfaced by
// the validator until vB.3 authors it). All content invariants are the validator's job.
export function carRowToQuestion(
  cells: Cells,
  topicMap: TopicMap,
  altText?: Record<string, string>,
): BankQuestion {
  const item = trim(cells.A);
  const topic = normalizeTopic(cells.B, topicMap);
  const mapped = topicMap.topics[topic];
  const slug = mapped?.slug ?? slugify(topic);
  const correctId = answerToOptionId(cells.C);

  const options = CAR_OPTION_COLUMNS.map(({ id, text, gif }) => {
    const gifRef = trim(cells[gif]);
    return gifRef
      ? imageOption(id, gifRef, id === correctId, altText)
      : textOption(id, trim(cells[text]), id === correctId);
  });

  const stem = trim(cells.M);
  return {
    item,
    topic,
    routeId: mapped?.routeId ?? 'route-0',
    conceptId: `c.${slug}.${item.toLowerCase()}`,
    prompt: trim(cells.D),
    options,
    explanation: trim(cells.J),
    sourceRefs: parseXRefs(cells.W),
    niExempt: Boolean(trim(cells.L)),
    ...(stem ? { stemImage: stem } : {}),
  };
}

// VMC sheet row → BankQuestion. The topic is a scene name (not canonical): the video bank
// routes by curated concept, so routeId is a placeholder here (validateBank({videoBank})
// skips the route check) and is assigned at authoring. clipId is the item minus its -N suffix.
export function vmcRowToQuestion(cells: Cells): BankQuestion {
  const item = trim(cells.A);
  const scene = trim(cells.B);
  const correctId = answerToOptionId(cells.C);

  const options = VMC_OPTION_COLUMNS.map(({ id, text }) =>
    textOption(id, trim(cells[text]), id === correctId),
  );

  return {
    item,
    topic: scene,
    routeId: 'route-3',
    conceptId: `c.${slugify(scene)}.${item.toLowerCase()}`,
    prompt: trim(cells.D),
    options,
    explanation: trim(cells.I),
    sourceRefs: parseXRefs(cells.J),
    niExempt: false,
    clipId: item.replace(/-\d+$/, ''),
  };
}
