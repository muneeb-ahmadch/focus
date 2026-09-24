import { z } from 'zod';
import {
  checkpointConceptId,
  MisconceptionEntry,
  MissionSchema,
  RouteMeta,
  SourceRef,
  SourceRefEntry,
  type Mission,
  type Step,
} from './schema';

export interface ContentIssue {
  file: string;
  where: string;
  message: string;
}

export interface ValidationReport {
  errors: ContentIssue[];
  warnings: ContentIssue[];
}

export interface RawContentInput {
  routes: unknown;
  sourceRefs: unknown;
  misconceptions: unknown;
  missions: { file: string; data: unknown }[];
}

const EXPECTED_ROUTE_IDS = Array.from({ length: 7 }, (_, i) => `route-${i + 1}`);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function indexInto(value: unknown, key: string | number): unknown {
  if (Array.isArray(value)) return typeof key === 'number' ? value[key] : undefined;
  if (isRecord(value)) return value[key];
  return undefined;
}

function getRawValueAtPath(data: unknown, path: (string | number)[]): unknown {
  let cur: unknown = data;
  for (const segment of path) cur = indexInto(cur, segment);
  return cur;
}

function getRawSteps(data: unknown): unknown[] {
  if (!isRecord(data)) return [];
  const steps = data.steps;
  return Array.isArray(steps) ? steps : [];
}

function resolveWhere(rawData: unknown, path: (string | number)[]): string {
  if (path[0] !== 'steps' || typeof path[1] !== 'number') {
    return path.length === 0 ? 'mission' : String(path[0]);
  }
  const stepIndex = path[1];
  const rawStep = getRawSteps(rawData)[stepIndex];
  const stepId = isRecord(rawStep) && typeof rawStep.id === 'string' ? rawStep.id : `steps[${stepIndex}]`;
  const questionsIndex = path.indexOf('questions');
  if (questionsIndex !== -1 && typeof path[questionsIndex + 1] === 'number') {
    return `${stepId}#q${path[questionsIndex + 1]}`;
  }
  return stepId;
}

function resolveMessage(issue: z.ZodIssue, rawData: unknown): string {
  if (issue.code === z.ZodIssueCode.invalid_union_discriminator) {
    const raw = getRawValueAtPath(rawData, issue.path);
    return `unknown step type "${String(raw)}"`;
  }
  if (issue.code === z.ZodIssueCode.too_big && issue.type === 'string') {
    const field = issue.path[issue.path.length - 1];
    return `${String(field)} exceeds ${issue.maximum} characters`;
  }
  return issue.message;
}

function mapMissionIssue(file: string, rawData: unknown, issue: z.ZodIssue): ContentIssue {
  if (issue.path.length === 0 && issue.code === z.ZodIssueCode.invalid_type) {
    return { file, where: 'mission', message: 'mission file is not a valid mission object' };
  }
  return { file, where: resolveWhere(rawData, issue.path), message: resolveMessage(issue, rawData) };
}

interface QuestionSite {
  where: string;
  options: { correct: boolean; misconceptionId?: string }[];
  sourceRef?: string;
  conceptId?: string;
  // A curated bankRef checkpoint question: no authored options/sourceRef to validate here (the
  // resolved bank question owns those); its concept is the bankRef.
  isBankRef?: boolean;
}

function questionSitesForStep(step: Step): QuestionSite[] {
  if (step.type === 'checkpoint') {
    return step.questions.map((q, i) =>
      'bankRef' in q
        ? { where: `${step.id}#q${i}`, options: [], conceptId: q.bankRef, isBankRef: true }
        : {
            where: `${step.id}#q${i}`,
            options: q.options,
            sourceRef: q.sourceRef,
            conceptId: q.conceptId,
          },
    );
  }
  if (step.type === 'sequence') return [];
  return [{ where: step.id, options: step.question.options }];
}

export function validateContent(input: RawContentInput): ValidationReport {
  const errors: ContentIssue[] = [];
  const warnings: ContentIssue[] = [];

  const routesParsed = z.array(RouteMeta).safeParse(input.routes);
  const routeIds = new Set(routesParsed.success ? routesParsed.data.map((r) => r.routeId) : []);
  const routesMatchExactly =
    routeIds.size === EXPECTED_ROUTE_IDS.length && EXPECTED_ROUTE_IDS.every((id) => routeIds.has(id));
  if (!routesMatchExactly) {
    errors.push({
      file: 'routes.json',
      where: 'routes',
      message: 'routes.json must define exactly route-1 through route-7',
    });
  }

  const sourceRefsParsed = z.record(SourceRef, SourceRefEntry).safeParse(input.sourceRefs);
  const sourceRefKeys = new Set(sourceRefsParsed.success ? Object.keys(sourceRefsParsed.data) : []);

  const misconceptionsParsed = z.array(MisconceptionEntry).safeParse(input.misconceptions);
  const misconceptions = misconceptionsParsed.success ? misconceptionsParsed.data : [];
  const misconceptionTaxonomy = new Map<string, MisconceptionEntry>();
  for (const m of misconceptions) {
    if (misconceptionTaxonomy.has(m.misconceptionId)) {
      errors.push({
        file: 'misconceptions.json',
        where: m.misconceptionId,
        message: `duplicate misconceptionId "${m.misconceptionId}"`,
      });
    } else {
      misconceptionTaxonomy.set(m.misconceptionId, m);
    }
    if (!sourceRefKeys.has(m.sourceRef)) {
      errors.push({
        file: 'misconceptions.json',
        where: m.misconceptionId,
        message: `unknown sourceRef "${m.sourceRef}"`,
      });
    }
  }

  const parsedMissions: { file: string; mission: Mission }[] = [];
  for (const { file, data } of input.missions) {
    const result = MissionSchema.safeParse(data);
    if (!result.success) {
      const seen = new Set<string>();
      for (const issue of result.error.issues) {
        const mapped = mapMissionIssue(file, data, issue);
        const key = `${mapped.file}||${mapped.where}||${mapped.message}`;
        if (seen.has(key)) continue;
        seen.add(key);
        errors.push(mapped);
      }
      continue;
    }
    parsedMissions.push({ file, mission: result.data });
  }

  const missionIdFirstSeenAt = new Map<string, string>();
  const referencedMisconceptionIds = new Set<string>();

  for (const { file, mission } of parsedMissions) {
    if (missionIdFirstSeenAt.has(mission.missionId)) {
      errors.push({
        file,
        where: mission.missionId,
        message: `duplicate missionId "${mission.missionId}"`,
      });
    } else {
      missionIdFirstSeenAt.set(mission.missionId, file);
    }

    const seenStepIds = new Set<string>();
    for (const step of mission.steps) {
      if (seenStepIds.has(step.id)) {
        errors.push({
          file,
          where: mission.missionId,
          message: `duplicate step id "${step.id}"`,
        });
      } else {
        seenStepIds.add(step.id);
      }
    }

    if (!routeIds.has(mission.routeId)) {
      errors.push({
        file,
        where: mission.missionId,
        message: `routeId "${mission.routeId}" is not in routes.json`,
      });
    }

    const checkpointCount = mission.steps.filter((s) => s.type === 'checkpoint').length;
    const lastStep = mission.steps[mission.steps.length - 1];
    if (checkpointCount !== 1 || lastStep.type !== 'checkpoint') {
      errors.push({
        file,
        where: mission.missionId,
        message: 'mission must end with exactly one checkpoint step',
      });
    }

    const taughtConcepts = new Set(
      mission.steps.filter((s) => s.type !== 'checkpoint').map((s) => s.conceptId),
    );
    const checkpointStep = mission.steps.find(
      (s): s is Extract<Step, { type: 'checkpoint' }> => s.type === 'checkpoint',
    );
    if (checkpointStep) {
      checkpointStep.questions.forEach((q, i) => {
        const concept = checkpointConceptId(q);
        if (!taughtConcepts.has(concept)) {
          errors.push({
            file,
            where: `${checkpointStep.id}#q${i}`,
            message: `checkpoint concept "${concept}" is not taught by any step in this mission`,
          });
        }
      });
    }

    for (const step of mission.steps) {
      if (!sourceRefKeys.has(step.sourceRef)) {
        errors.push({ file, where: step.id, message: `unknown sourceRef "${step.sourceRef}"` });
      }
    }

    const sites = mission.steps.flatMap((step) => questionSitesForStep(step));
    for (const site of sites) {
      for (const option of site.options) {
        if (option.misconceptionId) {
          referencedMisconceptionIds.add(option.misconceptionId);
          if (!misconceptionTaxonomy.has(option.misconceptionId)) {
            errors.push({
              file,
              where: site.where,
              message: `unknown misconceptionId "${option.misconceptionId}"`,
            });
          }
        }
      }
      if (site.sourceRef !== undefined && !sourceRefKeys.has(site.sourceRef)) {
        errors.push({ file, where: site.where, message: `unknown sourceRef "${site.sourceRef}"` });
      }
    }

    for (const site of sites) {
      if (site.isBankRef) continue; // no authored options to tag; the bank owns the distractors
      if (!site.options.some((o) => !o.correct && o.misconceptionId)) {
        warnings.push({ file, where: site.where, message: 'no misconception-tagged distractor' });
      }
    }

    const authoredSites = sites.filter((s) => !s.isBankRef);
    if (authoredSites.length >= 3 && authoredSites.every((s) => s.options[0]?.correct === true)) {
      warnings.push({
        file,
        where: mission.missionId,
        message: `positional answer bias: every correct option in "${mission.missionId}" is authored first`,
      });
    }
  }

  for (const id of misconceptionTaxonomy.keys()) {
    if (!referencedMisconceptionIds.has(id)) {
      warnings.push({
        file: 'misconceptions.json',
        where: id,
        message: `misconception "${id}" is never referenced`,
      });
    }
  }

  return { errors, warnings };
}
