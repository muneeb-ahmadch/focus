import { z } from 'zod';
import type { AnswerRecord, Phase, ResumePayload } from './playerStore';

const phaseSchema: z.ZodType<Phase> = z.union([
  z.literal('card'),
  z.literal('feedback'),
  z.literal('checkpoint-intro'),
  z.literal('repair-intro'),
  z.literal('drill-summary'),
  z.literal('failed'),
]);

const answerRecordSchema: z.ZodType<AnswerRecord> = z.object({
  stepId: z.string(),
  conceptId: z.string(),
  correct: z.boolean(),
  confidence: z.union([z.literal('sure'), z.literal('unsure')]),
  misconceptionId: z.string().optional(),
});

const resumePayloadSchema: z.ZodType<ResumePayload> = z.object({
  phase: phaseSchema,
  index: z.number().int().min(0),
  answers: z.array(answerRecordSchema),
  checkpointAnswers: z.array(answerRecordSchema),
  inRepair: z.boolean(),
  originalCheckpointScore: z.number().min(0).max(1).optional(),
  queueIds: z.array(z.string()),
});

export function parseResumePayload(json: string | null | undefined): ResumePayload | undefined {
  if (!json) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  const result = resumePayloadSchema.safeParse(parsed);
  return result.success ? result.data : undefined;
}
