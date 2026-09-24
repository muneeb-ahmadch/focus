import { MISSIONS, pickDrillQuestion } from '@/content';
import type { Db } from '@/db/adapter';
import { getMissionState } from '@/db/repo/missions';

export const QUICK_DRILL_SIZE = 5;

// CURRICULUM §4 P1-2: the interleaved cross-route quick-drill draws from every
// COMPLETED mission's taught concepts (checkpoints are assessment, not retrieval
// fodder), resolvable to a drill question, deduped, then round-robined across
// routes so the drill mixes routes instead of replaying one. Deterministic — no
// clock, no randomness — so the plan and the started drill agree. The engine
// only receives whether ≥ QUICK_DRILL_SIZE concepts exist (quickDrillAvailable);
// the actual pool is built here and handed to playerStore.startQuickDrill.
export function quickDrillConcepts(db: Db): string[] {
  const byRoute = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const mission of MISSIONS) {
    if (getMissionState(db, mission.missionId)?.status !== 'completed') continue;
    for (const step of mission.steps) {
      if (step.type === 'checkpoint') continue;
      if (seen.has(step.conceptId)) continue;
      if (!pickDrillQuestion(step.conceptId)) continue;
      seen.add(step.conceptId);
      const list = byRoute.get(mission.routeId) ?? [];
      list.push(step.conceptId);
      byRoute.set(mission.routeId, list);
    }
  }

  const routeIds = [...byRoute.keys()].sort();
  const interleaved: string[] = [];
  for (let col = 0; ; col++) {
    let added = false;
    for (const routeId of routeIds) {
      const concept = byRoute.get(routeId)![col];
      if (concept !== undefined) {
        interleaved.push(concept);
        added = true;
      }
    }
    if (!added) break;
  }
  return interleaved;
}

export function quickDrillAvailable(db: Db): boolean {
  return quickDrillConcepts(db).length >= QUICK_DRILL_SIZE;
}
