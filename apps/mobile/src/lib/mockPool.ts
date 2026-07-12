import type { Blueprint, MockPoolQuestion } from '@focus/engine';
import type { Question } from '@focus/shared';
import { ROUTES } from '@/content';

export interface PoolQuestion {
  id: string;
  conceptId: string;
  routeId: string;
  prompt: string;
  options: Question['options'];
  video: boolean;
  sign: boolean;
}

export const MOCK_BLUEPRINT: Blueprint = { total: 50, videoCount: 3, minSigns: 1 };

interface BuiltPool {
  pool: MockPoolQuestion[];
  questionById: Map<string, PoolQuestion>;
}

let cache: BuiltPool | null = null;

function buildPool(): BuiltPool {
  const pool: MockPoolQuestion[] = [];
  const questionById = new Map<string, PoolQuestion>();
  const videoCandidates: string[] = [];

  for (const route of ROUTES) {
    for (const mission of route.missions) {
      for (const step of mission.steps) {
        if (step.type === 'checkpoint') {
          step.questions.forEach((q, i) => {
            const id = `${step.id}#q${i}`;
            questionById.set(id, {
              id,
              conceptId: q.conceptId,
              routeId: route.routeId,
              prompt: q.prompt,
              options: q.options,
              video: false,
              sign: false,
            });
            pool.push({ id, routeId: route.routeId, video: false, sign: false });
          });
          continue;
        }
        if (step.type === 'sequence') continue;

        const id = step.id;
        const sign = step.type === 'sign_meaning';
        questionById.set(id, {
          id,
          conceptId: step.conceptId,
          routeId: route.routeId,
          prompt: step.question.prompt,
          options: step.question.options,
          video: false,
          sign,
        });
        pool.push({ id, routeId: route.routeId, video: false, sign });
        if (step.type === 'scene_decision' || step.type === 'hazard_cue') videoCandidates.push(id);
      }
    }
  }

  for (const id of videoCandidates.sort().slice(0, MOCK_BLUEPRINT.videoCount)) {
    questionById.get(id)!.video = true;
    pool.find((q) => q.id === id)!.video = true;
  }

  return { pool, questionById };
}

export function getMockPool(): BuiltPool {
  if (!cache) cache = buildPool();
  return cache;
}
