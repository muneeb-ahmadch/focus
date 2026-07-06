import type { RouteContentInfo } from '@/db/repo/routes';
import { MissionSchema, type Mission, type Question } from './schema';
import mission1 from './route-1/mission-1.json';
import mission2 from './route-1/mission-2.json';
import mission3 from './route-1/mission-3.json';
import mission4 from './route-1/mission-4.json';
import mission5 from './route-1/mission-5.json';

export const MISSIONS: Mission[] = [mission1, mission2, mission3, mission4, mission5].map(
  (raw) => MissionSchema.parse(raw),
);

export interface RouteDef {
  routeId: string;
  title: string;
  missions: Mission[];
}

export const ROUTES: RouteDef[] = [
  { routeId: 'route-1', title: 'Road Basics', missions: MISSIONS.filter((m) => m.routeId === 'route-1') },
  { routeId: 'route-2', title: 'Signs', missions: [] },
  { routeId: 'route-3', title: 'Hazard Awareness', missions: [] },
  { routeId: 'route-4', title: 'Junctions', missions: [] },
  { routeId: 'route-5', title: 'Motorways', missions: [] },
  { routeId: 'route-6', title: 'Vulnerable Road Users', missions: [] },
  { routeId: 'route-7', title: 'Vehicle & Documents', missions: [] },
];

export function getMission(id: string): Mission | undefined {
  return MISSIONS.find((m) => m.missionId === id);
}

export function getRouteMissions(routeId: string): Mission[] {
  return ROUTES.find((r) => r.routeId === routeId)?.missions ?? [];
}

export interface ConceptQuestionRef {
  missionId: string;
  stepId: string;
  checkpointIndex?: number;
}

export interface ConceptInfo {
  routeId: string;
  teachingStepIds: string[];
  questions: ConceptQuestionRef[];
}

function buildConceptIndex(): Map<string, ConceptInfo> {
  const index = new Map<string, ConceptInfo>();
  const entry = (conceptId: string, routeId: string): ConceptInfo => {
    let info = index.get(conceptId);
    if (!info) {
      info = { routeId, teachingStepIds: [], questions: [] };
      index.set(conceptId, info);
    }
    return info;
  };
  for (const mission of MISSIONS) {
    for (const step of mission.steps) {
      if (step.type === 'checkpoint') {
        step.questions.forEach((q, i) => {
          entry(q.conceptId, mission.routeId).questions.push({
            missionId: mission.missionId,
            stepId: step.id,
            checkpointIndex: i,
          });
        });
        continue;
      }
      const info = entry(step.conceptId, mission.routeId);
      info.teachingStepIds.push(step.id);
      if (step.type !== 'sequence') {
        info.questions.push({ missionId: mission.missionId, stepId: step.id });
      }
    }
  }
  return index;
}

export const conceptIndex = buildConceptIndex();

export interface DrillQuestion {
  conceptId: string;
  missionId: string;
  stepId: string;
  question: Question;
}

export function pickDrillQuestion(conceptId: string): DrillQuestion | undefined {
  for (const mission of MISSIONS) {
    for (const step of mission.steps) {
      if (step.type !== 'checkpoint') continue;
      const q = step.questions.find((cq) => cq.conceptId === conceptId);
      if (q) {
        return {
          conceptId,
          missionId: mission.missionId,
          stepId: step.id,
          question: { prompt: q.prompt, options: q.options, explanation: q.explanation },
        };
      }
    }
  }
  for (const mission of MISSIONS) {
    for (const step of mission.steps) {
      if (step.type === 'checkpoint' || step.type === 'sequence') continue;
      if (step.conceptId === conceptId) {
        return {
          conceptId,
          missionId: mission.missionId,
          stepId: step.id,
          question: step.question,
        };
      }
    }
  }
  return undefined;
}

export function getRouteManifest(): RouteContentInfo[] {
  return ROUTES.map((route) => {
    const conceptIds = new Set<string>();
    for (const [conceptId, info] of conceptIndex) {
      if (info.routeId === route.routeId) conceptIds.add(conceptId);
    }
    return { routeId: route.routeId, totalMissions: route.missions.length, conceptIds };
  });
}
