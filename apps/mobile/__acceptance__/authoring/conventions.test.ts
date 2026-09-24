import { describe, expect, it } from 'vitest';
import { MISSIONS, ROUTES } from '@/content';

// Authoring conventions for every route built through the vB pipeline (R2–R7). A curated
// concept-map (content/bank/concept-map.json) stamps item-free concept ids onto real DVSA
// questions, and each checkpoint references them by bankRef — no licensed content in the tracked
// pack. These assertions read the tracked pack only (no bank), so they hold on any clone; the real
// bankRef resolution against the licensed bank is a build-time check (`content check`) plus the
// device smoke.
//
// Route 1 is excluded: it was authored before vB with inline checkpoint questions, and its text is
// pinned separately by v3/conversion-integrity.
//
// ARCS is the per-route pin — the missions authored so far, in order, with their titles. Adding a
// mission means adding one line here; adding a route means adding one entry. A route that has
// missions in the pack but no ARCS entry fails, so a new route cannot skip its arc pin.

const ARCS: Record<string, Record<string, string>> = {
  'route-2': {
    'r2-m1': 'Warning signs',
    'r2-m2': 'Order & priority signs',
    'r2-m3': 'Direction, info & markings',
    'r2-m4': 'Traffic lights & signals',
    'r2-m5': 'Signs in context',
  },
  'route-3': {
    'r3-m1': 'Spotting hazards',
    'r3-m2': 'Fog & poor visibility',
    'r3-m3': 'Stopping distance & grip',
    'r3-m4': 'Skids & control',
    'r3-m5': 'Staying sharp',
  },
  'route-4': {
    'r4-m1': 'Priority at junctions',
    'r4-m2': 'Roundabouts',
    'r4-m3': 'Crossings & pedestrian priority',
    'r4-m4': 'Lanes & one-way streets',
    'r4-m5': 'Level crossings',
  },
  'route-5': {
    'r5-m1': 'Joining the motorway',
    'r5-m2': 'Lanes & overtaking',
    'r5-m3': 'Smart motorways & red X',
    'r5-m4': 'Breakdowns & the hard shoulder',
    'r5-m5': 'Exits & roadworks',
  },
  'route-6': {
    'r6-m1': 'People on foot',
    'r6-m2': 'Children & school runs',
    'r6-m3': 'Motorcyclists at junctions',
    'r6-m4': 'Cyclists, riders & animals',
    'r6-m5': 'Large vehicles & learners',
  },
};

const pipelineRoutes = ROUTES.filter((r) => r.routeId !== 'route-1' && r.missions.length > 0).map(
  (r) => r.routeId,
);

describe('vB-pipeline authoring conventions', () => {
  it('every authored pipeline route declares its arc here', () => {
    for (const routeId of pipelineRoutes) {
      expect(Object.keys(ARCS), `${routeId} has missions but no ARCS entry`).toContain(routeId);
    }
  });

  for (const [routeId, arc] of Object.entries(ARCS)) {
    const missions = MISSIONS.filter((m) => m.routeId === routeId);

    describe(routeId, () => {
      it('carries exactly the authored arc, in order, with the authored titles', () => {
        expect(missions.map((m) => m.missionId)).toEqual(Object.keys(arc));
        for (const mission of missions) {
          expect(mission.title, mission.missionId).toBe(arc[mission.missionId]);
        }
      });

      for (const mission of missions) {
        describe(`${mission.missionId} — ${mission.title}`, () => {
          it('is draft until human fact-check, 6–10 steps, pretest-first opener (P0-2)', () => {
            expect(mission.reviewStatus).toBe('draft');
            expect(mission.steps.length).toBeGreaterThanOrEqual(6);
            expect(mission.steps.length).toBeLessThanOrEqual(10);
            expect(['scene_decision', 'sign_meaning']).toContain(mission.steps[0]!.type);
          });

          it('ends with a checkpoint of exactly five curated bankRefs, each concept taught earlier', () => {
            const checkpoint = mission.steps[mission.steps.length - 1]!;
            expect(checkpoint.type).toBe('checkpoint');
            if (checkpoint.type !== 'checkpoint') return;
            expect(checkpoint.questions).toHaveLength(5);
            expect(checkpoint.questions.every((q) => 'bankRef' in q)).toBe(true);
            const taught = new Set(
              mission.steps.filter((s) => s.type !== 'checkpoint').map((s) => s.conceptId),
            );
            for (const q of checkpoint.questions) {
              if ('bankRef' in q) expect(taught.has(q.bankRef), q.bankRef).toBe(true);
            }
          });

          it('tags a misconception distractor on every authored lesson question', () => {
            for (const step of mission.steps) {
              if (step.type === 'checkpoint' || step.type === 'sequence') continue;
              expect(
                step.question.options.some((o) => !o.correct && o.misconceptionId),
                `${step.id} has no misconception-tagged distractor`,
              ).toBe(true);
            }
          });

          it('numbers its step ids <missionId>-s1..sN', () => {
            expect(mission.steps.map((s) => s.id)).toEqual(
              mission.steps.map((_, i) => `${mission.missionId}-s${i + 1}`),
            );
          });
        });
      }
    });
  }
});
