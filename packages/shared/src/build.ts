import { z } from 'zod';
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

export function serializePack(pack: ContentPack): string {
  return `${JSON.stringify(canonicalize(pack), null, 2)}\n`;
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
