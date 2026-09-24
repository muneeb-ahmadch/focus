import { z } from 'zod';
import { BankQuestion, resolveBankQuestionByConcept, type BankFile } from './bank';
import {
  MisconceptionEntry,
  MissionSchema,
  RouteMeta,
  SourceRef,
  SourceRefEntry,
  type ContentPack,
  type Mission,
} from './schema';
import { validateContent, type RawContentInput, type ValidationReport } from './validate';

export interface UnresolvedBankRef {
  missionId: string;
  stepId: string;
  index: number;
  bankRef: string;
}

// Build-time resolution of curated checkpoint bankRefs against the bank; a ref that does not
// resolve BANK-WIDE by concept is reported so the CLI can fail loudly (runs only where the
// excluded bank exists). Authored inline checkpoint questions have nothing to resolve.
export function unresolvedCheckpointBankRefs(
  missions: Mission[],
  bank: BankFile,
): UnresolvedBankRef[] {
  const unresolved: UnresolvedBankRef[] = [];
  for (const mission of missions) {
    for (const step of mission.steps) {
      if (step.type !== 'checkpoint') continue;
      step.questions.forEach((q, index) => {
        if (!('bankRef' in q)) return;
        if (!resolveBankQuestionByConcept(bank, q.bankRef)) {
          unresolved.push({ missionId: mission.missionId, stepId: step.id, index, bankRef: q.bankRef });
        }
      });
    }
  }
  return unresolved;
}

export class ContentValidationError extends Error {
  readonly report: ValidationReport;

  constructor(report: ValidationReport) {
    super(`content validation failed: ${report.errors.length} error(s)`);
    this.name = 'ContentValidationError';
    this.report = report;
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

// The single canonical serializer — key-sorted, 2-space, trailing newline — used for both the
// content pack and the ingested bank so every generated JSON is byte-stable across machines.
export function serializeCanonical(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function serializePack(pack: ContentPack): string {
  return serializeCanonical(pack);
}

function bankQuestions(rawFile: unknown): unknown[] {
  const qs = (rawFile as { questions?: unknown } | null)?.questions;
  return Array.isArray(qs) ? qs : [];
}

// The app-facing pool bank: pool-eligible questions only, car then video. Questions that
// fail BankQuestion parse are dropped — today that is the image-option questions still
// awaiting alt-text (vB.3), so the bundled bank never carries a question the app can't
// render audibly (rule 8). Video questions (clipId) come from the VMC bank.
export function selectAppBank(rawCarFile: unknown, rawVmcFile: unknown): BankFile {
  const questions: BankQuestion[] = [];
  for (const raw of [...bankQuestions(rawCarFile), ...bankQuestions(rawVmcFile)]) {
    const parsed = BankQuestion.safeParse(raw);
    if (parsed.success) questions.push(parsed.data);
  }
  return { bankFormat: 1, source: 'Focus question bank', questions };
}

export function buildBank(rawCarFile: unknown, rawVmcFile: unknown): string {
  return serializeCanonical(selectAppBank(rawCarFile, rawVmcFile));
}

function ascending(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildPack(input: RawContentInput): string {
  const report = validateContent(input);
  if (report.errors.length > 0) throw new ContentValidationError(report);

  const routeMetas = z.array(RouteMeta).parse(input.routes);
  const misconceptions = z.array(MisconceptionEntry).parse(input.misconceptions);
  const sourceRefs = z.record(SourceRef, SourceRefEntry).parse(input.sourceRefs);

  const missionsByRoute = new Map<string, Mission[]>();
  for (const { data } of input.missions) {
    const mission = MissionSchema.parse(data);
    const list = missionsByRoute.get(mission.routeId) ?? [];
    list.push(mission);
    missionsByRoute.set(mission.routeId, list);
  }

  const routes = [...routeMetas]
    .sort((a, b) => ascending(a.routeId, b.routeId))
    .map((r) => ({
      routeId: r.routeId,
      title: r.title,
      missions: [...(missionsByRoute.get(r.routeId) ?? [])].sort((a, b) =>
        ascending(a.missionId, b.missionId),
      ),
    }));

  const pack: ContentPack = {
    packFormat: 1,
    routes,
    misconceptions: [...misconceptions].sort((a, b) => ascending(a.misconceptionId, b.misconceptionId)),
    sourceRefs,
  };

  return serializePack(pack);
}
