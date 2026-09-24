import { z } from 'zod';
import { ConceptId } from './schema';

// Structured source ref parsed from the official XRefs column: "DES s4" -> "DES-s4",
// "HC r159" -> "HC-r159", "KYTS p80" -> "KYTS-p80".
export const BankSourceRef = z.string().regex(/^(DES|HC|KYTS|TSRGD|DVSA)-[A-Za-z0-9.]+$/);

// Answer options are lettered a–d (from the official OptionA–D columns). Every option
// must be audible (product rule 8): a text option speaks its text; an image option
// speaks its authored altText. Exactly one of text | imageRef is present.
const BankOption = z
  .object({
    id: z.enum(['a', 'b', 'c', 'd']),
    text: z.string().trim().min(1).max(100).optional(),
    imageRef: z.string().min(1).optional(),
    altText: z.string().trim().min(1).max(160).optional(),
    correct: z.boolean(),
  })
  .superRefine((o, ctx) => {
    if (!!o.text === !!o.imageRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'option must have either text or imageRef, not both or neither',
      });
    }
    if (o.imageRef && !o.altText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'image option requires altText (rule 8: every option is audible)',
      });
    }
  });

const bankQuestionShape = {
  item: z.string().regex(/^[A-Za-z]{2}\d{3,4}(-\d+)?$/),
  topic: z.string().trim().min(1),
  routeId: z.string().regex(/^route-\d+$/),
  conceptId: ConceptId,
  prompt: z.string().trim().min(1).max(240),
  options: z.array(BankOption).min(2).max(4),
  explanation: z.string().trim().min(1).max(600),
  sourceRefs: z.array(BankSourceRef).min(1),
  stemImage: z.string().min(1).optional(),
  niExempt: z.boolean(),
  clipId: z.string().min(1).optional(),
};

const exactlyOneCorrect = (
  q: { options: { correct: boolean }[] },
  ctx: z.RefinementCtx,
): void => {
  if (q.options.filter((o) => o.correct).length !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'exactly one option must be correct' });
  }
};

export const BankQuestion = z.object(bankQuestionShape).superRefine(exactlyOneCorrect);
export type BankQuestion = z.infer<typeof BankQuestion>;

export const BankFile = z.object({
  bankFormat: z.literal(1),
  source: z.string().min(1),
  questions: z.array(BankQuestion),
});
export type BankFile = z.infer<typeof BankFile>;

// Resolve a checkpoint bankRef BANK-WIDE by concept, cross-topic — the topic-map only governs
// practice/mock quotas, never checkpoints (locked decision P0-1). First question wins for a
// concept shared by several bank items.
export function resolveBankQuestionByConcept(
  bank: BankFile,
  conceptId: string,
): BankQuestion | undefined {
  return bank.questions.find((q) => q.conceptId === conceptId);
}

export const TopicMap = z.object({
  topicMapFormat: z.literal(1),
  variants: z.record(z.string(), z.string()),
  topics: z.record(
    z.string(),
    z.object({ routeId: z.string().regex(/^route-\d+$/), slug: z.string().regex(/^[a-z0-9-]+$/) }),
  ),
});
export type TopicMap = z.infer<typeof TopicMap>;

export interface BankIssue {
  where: string;
  message: string;
}
export interface BankReport {
  errors: BankIssue[];
  warnings: BankIssue[];
}

export interface BankValidateOptions {
  // When present, every stemImage and option imageRef must resolve to a bundled asset.
  images?: Set<string>;
  // The VMC bank routes by curated concept, not the topic-map, and every clip owns
  // exactly three questions.
  videoBank?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateBank(
  rawBank: unknown,
  topicMap: TopicMap,
  opts: BankValidateOptions = {},
): BankReport {
  const errors: BankIssue[] = [];
  const warnings: BankIssue[] = [];

  if (!isRecord(rawBank) || rawBank.bankFormat !== 1 || !Array.isArray(rawBank.questions)) {
    errors.push({ where: 'bank', message: 'bank file must be { bankFormat: 1, source, questions[] }' });
    return { errors, warnings };
  }

  const seenItems = new Set<string>();
  const clipCounts = new Map<string, number>();

  rawBank.questions.forEach((rawQ, i) => {
    const where = isRecord(rawQ) && typeof rawQ.item === 'string' ? rawQ.item : `questions[${i}]`;
    const result = BankQuestion.safeParse(rawQ);
    if (!result.success) {
      errors.push({ where, message: result.error.issues[0]!.message });
      return;
    }
    const q = result.data;

    if (seenItems.has(q.item)) errors.push({ where: q.item, message: `duplicate item "${q.item}"` });
    else seenItems.add(q.item);

    if (!opts.videoBank) {
      const mapped = topicMap.topics[q.topic];
      if (!mapped) {
        errors.push({ where: q.item, message: `topic "${q.topic}" is not a canonical topic in topic-map` });
      } else if (mapped.routeId !== q.routeId) {
        errors.push({
          where: q.item,
          message: `routeId "${q.routeId}" does not match topic-map (${mapped.routeId})`,
        });
      }
    }

    if (opts.images) {
      const refs = [q.stemImage, ...q.options.map((o) => o.imageRef)].filter(
        (r): r is string => typeof r === 'string',
      );
      for (const ref of refs) {
        if (!opts.images.has(ref)) errors.push({ where: q.item, message: `unresolved image "${ref}"` });
      }
    }

    if (opts.videoBank) {
      if (!q.clipId) errors.push({ where: q.item, message: 'video question missing clipId' });
      else clipCounts.set(q.clipId, (clipCounts.get(q.clipId) ?? 0) + 1);
    }
  });

  if (opts.videoBank) {
    for (const [clipId, n] of clipCounts) {
      if (n !== 3) {
        errors.push({ where: clipId, message: `clip "${clipId}" has ${n} questions, expected exactly 3` });
      }
    }
  }

  return { errors, warnings };
}
