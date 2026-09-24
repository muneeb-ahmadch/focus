import { describe, expect, it } from 'vitest';
import {
  MISSIONS,
  ROUTES,
  MISCONCEPTIONS,
  checkpointConceptId,
  getMission,
  conceptIndex,
  getRouteManifest,
} from '@/content';

type Mission = (typeof MISSIONS)[number];
type AnyQuestion = { prompt: string; options: { id: string; correct: boolean; misconceptionId?: string }[] };

function allQuestions(m: Mission): AnyQuestion[] {
  const out: AnyQuestion[] = [];
  for (const step of m.steps) {
    if (step.type === 'checkpoint') {
      for (const q of step.questions) if (!('bankRef' in q)) out.push(q);
    } else if (step.type !== 'sequence') out.push(step.question);
  }
  return out;
}

// Missions authored so far, per route. Bump the count when a mission lands; a route absent here
// must still be empty in the pack. Mission ids follow r<N>-m<1..count>.
const AUTHORED: Record<string, number> = {
  'route-1': 5,
  'route-2': 5,
  'route-3': 5,
  'route-4': 5,
  'route-5': 5,
  'route-6': 5,
  'route-7': 6,
};

const expectedMissionIds = Object.entries(AUTHORED)
  .flatMap(([routeId, count]) =>
    Array.from({ length: count }, (_, i) => `r${routeId.split('-')[1]}-m${i + 1}`),
  )
  .sort();

describe('content loads from the generated pack', () => {
  it('all authored missions load with their ids', () => {
    expect(MISSIONS.map((m) => m.missionId).sort()).toEqual(expectedMissionIds);
    for (const id of expectedMissionIds) {
      expect(getMission(id)?.missionId).toBe(id);
    }
  });

  it('all seven routes exist; authored routes carry their mission count, the rest are empty', () => {
    expect(ROUTES).toHaveLength(7);
    expect(ROUTES[0]!.routeId).toBe('route-1');
    expect(ROUTES[0]!.title).toBe('Road Basics');
    const manifest = getRouteManifest();
    expect(manifest).toHaveLength(7);
    for (const route of ROUTES) {
      const expected = AUTHORED[route.routeId] ?? 0;
      expect(route.missions, route.routeId).toHaveLength(expected);
      expect(manifest.find((r) => r.routeId === route.routeId)?.totalMissions, route.routeId).toBe(
        expected,
      );
    }
  });

  it('missions remain reviewStatus draft until human fact-check', () => {
    for (const m of MISSIONS) expect(m.reviewStatus, m.missionId).toBe('draft');
  });

  it('every misconceptionId referenced by an option exists in the loaded taxonomy', () => {
    const taxonomy = new Set(MISCONCEPTIONS.map((e) => e.misconceptionId));
    expect(taxonomy.size).toBeGreaterThanOrEqual(30);
    for (const m of MISSIONS) {
      for (const q of allQuestions(m)) {
        for (const o of q.options) {
          if (o.misconceptionId) {
            expect(taxonomy.has(o.misconceptionId), `${m.missionId}: ${o.misconceptionId}`).toBe(
              true,
            );
          }
        }
      }
    }
  });

  it('conceptIndex still maps every checkpoint concept to a teaching step', () => {
    for (const m of MISSIONS) {
      for (const step of m.steps) {
        if (step.type !== 'checkpoint') continue;
        for (const q of step.questions) {
          const concept = checkpointConceptId(q);
          const info = conceptIndex.get(concept);
          expect(info, `${m.missionId}: ${concept}`).toBeDefined();
          expect(
            info!.teachingStepIds.length,
            `${m.missionId}: ${concept} has no teaching step`,
          ).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('answer positions are de-biased: no mission has every correct option first', () => {
    for (const m of MISSIONS) {
      const questions = allQuestions(m);
      expect(questions.length).toBeGreaterThanOrEqual(3);
      expect(
        questions.some((q) => !q.options[0]!.correct),
        `${m.missionId}: every correct option sits at position 0`,
      ).toBe(true);
      expect(
        questions.some((q) => q.options.find((o) => o.correct)!.id !== 'a'),
        `${m.missionId}: every correct option is id "a"`,
      ).toBe(true);
    }
  });
});
