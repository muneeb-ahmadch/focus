import { describe, expect, it } from 'vitest';
import {
  MISSIONS,
  ROUTES,
  MISCONCEPTIONS,
  getMission,
  conceptIndex,
  getRouteManifest,
} from '@/content';

type Mission = (typeof MISSIONS)[number];
type AnyQuestion = { prompt: string; options: { id: string; correct: boolean; misconceptionId?: string }[] };

function allQuestions(m: Mission): AnyQuestion[] {
  const out: AnyQuestion[] = [];
  for (const step of m.steps) {
    if (step.type === 'checkpoint') out.push(...step.questions);
    else if (step.type !== 'sequence') out.push(step.question);
  }
  return out;
}

describe('content loads from the generated pack', () => {
  it('all five Route 1 missions load with their ids', () => {
    expect(MISSIONS.map((m) => m.missionId).sort()).toEqual([
      'r1-m1',
      'r1-m2',
      'r1-m3',
      'r1-m4',
      'r1-m5',
    ]);
    for (const id of ['r1-m1', 'r1-m2', 'r1-m3', 'r1-m4', 'r1-m5']) {
      expect(getMission(id)?.missionId).toBe(id);
    }
  });

  it('all seven routes exist; route-1 carries the missions, the rest are empty', () => {
    expect(ROUTES).toHaveLength(7);
    expect(ROUTES[0]!.routeId).toBe('route-1');
    expect(ROUTES[0]!.title).toBe('Road Basics');
    expect(ROUTES[0]!.missions).toHaveLength(5);
    for (const route of ROUTES.slice(1)) expect(route.missions).toHaveLength(0);
    const manifest = getRouteManifest();
    expect(manifest).toHaveLength(7);
    expect(manifest.find((r) => r.routeId === 'route-1')?.totalMissions).toBe(5);
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
          const info = conceptIndex.get(q.conceptId);
          expect(info, `${m.missionId}: ${q.conceptId}`).toBeDefined();
          expect(
            info!.teachingStepIds.length,
            `${m.missionId}: ${q.conceptId} has no teaching step`,
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
