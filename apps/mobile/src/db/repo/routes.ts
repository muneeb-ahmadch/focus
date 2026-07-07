import { todayLocal } from '@/lib/clock';
import { computeRouteMastery } from '@focus/engine';
import type { Db } from '../adapter';

export interface RouteState {
  route_id: string;
  mastery: number;
  completed_missions: number;
  total_missions: number;
  weak_concept_count: number;
  due_review_count: number;
  last_attempt_at: string | null;
}

export interface RouteContentInfo {
  routeId: string;
  totalMissions: number;
  conceptIds: ReadonlySet<string>;
}

export function getRouteState(db: Db, routeId: string): RouteState | undefined {
  return db.get<RouteState>('SELECT * FROM route_state WHERE route_id = ?', [routeId]);
}

export function getAllRouteStates(db: Db): RouteState[] {
  return db.all<RouteState>('SELECT * FROM route_state ORDER BY route_id');
}

export function syncRoutesFromContent(db: Db, manifest: RouteContentInfo[]): void {
  for (const route of manifest) {
    db.run(
      `INSERT INTO route_state (route_id, total_missions) VALUES (?, ?)
       ON CONFLICT(route_id) DO UPDATE SET total_missions = excluded.total_missions`,
      [route.routeId, route.totalMissions],
    );
  }
}

export function recomputeRoute(db: Db, routeId: string, info: RouteContentInfo): void {
  const today = todayLocal();
  const completed =
    db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM mission_state WHERE route_id = ? AND status = 'completed'`,
      [routeId],
    )?.n ?? 0;
  const checkpointScores = db
    .all<{ s: number }>(
      `SELECT best_checkpoint_score AS s FROM mission_state
       WHERE route_id = ? AND best_checkpoint_score IS NOT NULL`,
      [routeId],
    )
    .map((r) => r.s);
  const activeItems = db.all<{ concept_id: string; lapses: number; due_at: string }>(
    `SELECT concept_id, lapses, due_at FROM review_item WHERE status = 'active'`,
  );
  const routeItems = activeItems.filter((r) => info.conceptIds.has(r.concept_id));
  const weakConcepts = routeItems.filter((r) => r.lapses >= 1).length;
  const dueCount = routeItems.filter((r) => r.due_at <= today).length;
  const mastery = computeRouteMastery({
    completed,
    total: info.totalMissions,
    checkpointScores,
    weakConcepts,
  });
  db.run(
    `UPDATE route_state
     SET mastery = ?, completed_missions = ?, weak_concept_count = ?, due_review_count = ?, last_attempt_at = ?
     WHERE route_id = ?`,
    [mastery, completed, weakConcepts, dueCount, today, routeId],
  );
}
