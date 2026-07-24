import { now } from '@/lib/clock';
import type { Db } from '../adapter';

export type MissionStatus = 'not_started' | 'in_progress' | 'completed' | 'failed_checkpoint';

export interface MissionState {
  mission_id: string;
  route_id: string;
  status: MissionStatus;
  best_checkpoint_score: number | null;
  current_step_index: number;
  resume_payload_json: string | null;
  updated_at: string | null;
}

export function getMissionState(db: Db, missionId: string): MissionState | undefined {
  return db.get<MissionState>('SELECT * FROM mission_state WHERE mission_id = ?', [missionId]);
}

export function getResumableMission(db: Db): MissionState | undefined {
  return db.get<MissionState>(
    `SELECT * FROM mission_state
     WHERE status = 'in_progress' AND resume_payload_json IS NOT NULL
     ORDER BY updated_at DESC LIMIT 1`,
  );
}

export function getRouteMissionStates(db: Db, routeId: string): MissionState[] {
  return db.all<MissionState>(
    'SELECT * FROM mission_state WHERE route_id = ? ORDER BY mission_id',
    [routeId],
  );
}

export function ensureMissionRow(db: Db, missionId: string, routeId: string): void {
  db.run(
    'INSERT OR IGNORE INTO mission_state (mission_id, route_id) VALUES (?, ?)',
    [missionId, routeId],
  );
}

export function saveResume(db: Db, missionId: string, stepIndex: number, payloadJson: string): void {
  // Completion is monotonic (see failCheckpoint): replaying a completed mission
  // saves resume state but must not flip its status back to in_progress, otherwise
  // the once-per-mission completion rewards can't tell a replay from a first pass.
  db.run(
    `UPDATE mission_state
     SET status = CASE WHEN status = 'completed' THEN 'completed' ELSE 'in_progress' END,
         current_step_index = ?, resume_payload_json = ?, updated_at = ?
     WHERE mission_id = ?`,
    [stepIndex, payloadJson, now().toISOString(), missionId],
  );
}

export function completeMission(db: Db, missionId: string, score: number): void {
  db.run(
    `UPDATE mission_state
     SET status = 'completed',
         best_checkpoint_score = MAX(COALESCE(best_checkpoint_score, 0), ?),
         current_step_index = 0,
         resume_payload_json = NULL,
         updated_at = ?
     WHERE mission_id = ?`,
    [score, now().toISOString(), missionId],
  );
}

export function failCheckpoint(db: Db, missionId: string, score: number): void {
  // Completion is monotonic: once a mission is completed, failing a later replay's
  // checkpoint must not downgrade it back to failed_checkpoint (best_checkpoint_score
  // is already MAX-guarded; status gets the same protection).
  db.run(
    `UPDATE mission_state
     SET status = CASE WHEN status = 'completed' THEN 'completed' ELSE 'failed_checkpoint' END,
         best_checkpoint_score = MAX(COALESCE(best_checkpoint_score, 0), ?),
         current_step_index = 0,
         resume_payload_json = NULL,
         updated_at = ?
     WHERE mission_id = ?`,
    [score, now().toISOString(), missionId],
  );
}
