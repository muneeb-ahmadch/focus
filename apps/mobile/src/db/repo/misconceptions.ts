import type { MisconceptionEntry } from '@focus/shared';
import type { Db } from '../adapter';

export interface TriggeredMisconception {
  misconception_id: string;
  wrong_belief: string;
  repair_note: string;
  source_ref: string;
}

export function getTriggeredMisconception(db: Db, conceptId: string): TriggeredMisconception | undefined {
  return db.get<TriggeredMisconception>(
    `SELECT m.misconception_id, m.wrong_belief, m.repair_note, m.source_ref
     FROM misconception m
     JOIN answer_event ae ON ae.misconception_id = m.misconception_id
     WHERE m.concept_id = ? AND ae.correct = 0
     GROUP BY m.misconception_id
     HAVING COUNT(*) >= 2
     ORDER BY COUNT(*) DESC, m.misconception_id ASC
     LIMIT 1`,
    [conceptId],
  );
}

export function syncMisconceptionsFromContent(db: Db, entries: MisconceptionEntry[]): void {
  for (const entry of entries) {
    db.run(
      `INSERT INTO misconception (misconception_id, concept_id, wrong_belief, repair_note, source_ref)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(misconception_id) DO UPDATE SET
         concept_id = excluded.concept_id,
         wrong_belief = excluded.wrong_belief,
         repair_note = excluded.repair_note,
         source_ref = excluded.source_ref`,
      [entry.misconceptionId, entry.conceptId, entry.wrongBelief, entry.repairNote, entry.sourceRef],
    );
  }
}
