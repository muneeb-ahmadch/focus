import type { MisconceptionEntry } from '@focus/shared';
import type { Db } from '../adapter';

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
