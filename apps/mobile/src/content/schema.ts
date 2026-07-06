import { z } from 'zod';

export const ConceptId = z.string().regex(/^c\.[a-z0-9.-]+$/);
export const SourceRef = z.string().regex(/^(HC|KYTS|TSRGD|DVSA)-[A-Za-z0-9.-]+$/);
export const MisconceptionId = z.string().regex(/^m\.[a-z0-9.-]+$/);

const Option = z.object({
  id: z.string(),
  text: z.string().trim().min(1).max(90),
  correct: z.boolean(),
  misconceptionId: MisconceptionId.optional(),
});

const questionRules = (
  q: { options: { correct: boolean; misconceptionId?: string }[] },
  ctx: z.RefinementCtx,
): void => {
  if (q.options.filter((o) => o.correct).length !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'exactly one option must be correct' });
  }
  if (q.options.some((o) => o.correct && o.misconceptionId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'misconceptionId is only allowed on incorrect options',
    });
  }
};

const QuestionShape = {
  prompt: z.string().trim().min(1).max(120),
  options: z.array(Option).min(2).max(4),
  explanation: z.string().trim().min(1).max(160),
};

export const Question = z.object(QuestionShape).superRefine(questionRules);
export type Question = z.infer<typeof Question>;

const CheckpointQuestion = z
  .object({ ...QuestionShape, conceptId: ConceptId, sourceRef: SourceRef })
  .superRefine(questionRules);
export type CheckpointQuestion = z.infer<typeof CheckpointQuestion>;

const StepBase = {
  id: z.string(),
  conceptId: ConceptId,
  sourceRef: SourceRef,
};

const RuleCardStep = z.object({
  ...StepBase,
  type: z.literal('rule_card'),
  title: z.string().trim().min(1).max(40),
  body: z.string().trim().min(1).max(160),
  question: Question,
});

const SceneDecisionStep = z.object({
  ...StepBase,
  type: z.literal('scene_decision'),
  scene: z.string().trim().min(1).max(160),
  question: Question,
});

export const SignShape = z.enum([
  'warning-triangle',
  'order-red-ring',
  'mandatory-blue',
  'info-rect',
  'nsl-white',
]);
export type SignShape = z.infer<typeof SignShape>;

const SignMeaningStep = z.object({
  ...StepBase,
  type: z.literal('sign_meaning'),
  sign: z.object({
    shape: SignShape,
    glyph: z.string().max(4).optional(),
    label: z.string().max(30).optional(),
  }),
  question: Question,
});

const ContrastSide = z.object({
  label: z.string().trim().min(1).max(30),
  body: z.string().trim().min(1).max(120),
});

const ContrastStep = z.object({
  ...StepBase,
  type: z.literal('contrast'),
  a: ContrastSide,
  b: ContrastSide,
  question: Question,
});

const SequenceStep = z.object({
  ...StepBase,
  type: z.literal('sequence'),
  title: z.string().trim().min(1).max(40).optional(),
  prompt: z.string().trim().min(1).max(120),
  items: z
    .array(z.object({ id: z.string(), text: z.string().trim().min(1).max(90) }))
    .min(3)
    .max(4),
  correctOrder: z.array(z.string()),
  explanation: z.string().trim().min(1).max(160),
});

const HazardCueStep = z.object({
  ...StepBase,
  type: z.literal('hazard_cue'),
  scene: z.string().trim().min(1).max(160),
  question: Question,
});

const MisconceptionStep = z.object({
  ...StepBase,
  type: z.literal('misconception'),
  wrongBelief: z.string().trim().min(1).max(120),
  question: Question,
  repairNote: z.string().trim().min(1).max(160),
});

const CheckpointStep = z.object({
  ...StepBase,
  type: z.literal('checkpoint'),
  questions: z.array(CheckpointQuestion).length(5),
});

export const Step = z
  .discriminatedUnion('type', [
    RuleCardStep,
    SceneDecisionStep,
    SignMeaningStep,
    ContrastStep,
    SequenceStep,
    HazardCueStep,
    MisconceptionStep,
    CheckpointStep,
  ])
  .superRefine((step, ctx) => {
    if (step.type !== 'sequence') return;
    const itemIds = step.items.map((i) => i.id);
    const isPermutation =
      step.correctOrder.length === itemIds.length &&
      [...step.correctOrder].sort().join(',') === [...itemIds].sort().join(',');
    if (!isPermutation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'correctOrder must be a permutation of item ids',
      });
    }
  });
export type Step = z.infer<typeof Step>;
export type StepType = Step['type'];

export const MissionSchema = z.object({
  missionId: z.string().regex(/^r\d-m\d$/),
  routeId: z.string().regex(/^route-[1-7]$/),
  title: z.string().trim().min(1).max(40),
  estimatedMinutes: z.number().int().min(4).max(10),
  reviewStatus: z.enum(['draft', 'verified']),
  steps: z.array(Step).min(6).max(10),
});
export type Mission = z.infer<typeof MissionSchema>;
