import { PRACTICE_MIN_POOL, type PracticePoolQuestion } from '@focus/engine';
import type { Db } from '@/db/adapter';
import { getMockPool } from './mockPool';

export interface PracticeTopic {
  topic: string;
  label: string;
  count: number;
}

// DVSA's official theory topic categories, keyed by the conceptId slug the bank
// ingest assigns (source of truth: content/topic-map.json, which is git-excluded so
// it can't be imported at runtime). These category names are public DVSA labels, not
// licensed question content. Any slug not listed falls back to a title-cased slug.
const TOPIC_LABELS: Record<string, string> = {
  alertness: 'Alertness',
  attitude: 'Attitude',
  signs: 'Road and traffic signs',
  'hazard-awareness': 'Hazard awareness',
  'safety-margins': 'Safety margins',
  'vehicle-handling': 'Vehicle handling',
  'rules-of-the-road': 'Rules of the road',
  'motorway-rules': 'Motorway rules',
  'vulnerable-road-users': 'Vulnerable road users',
  'other-vehicles': 'Other types of vehicle',
  'safety-and-your-vehicle': 'Safety and your vehicle',
  'essential-documents': 'Essential documents',
  incidents: 'Incidents, accidents and emergencies',
  'vehicle-loading': 'Vehicle loading',
};

export function topicLabel(slug: string): string {
  return TOPIC_LABELS[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

let cache: PracticePoolQuestion[] | null = null;

export function getPracticePool(): PracticePoolQuestion[] {
  if (!cache) {
    // Practice is a learning surface with no video playback until v14 — video (VMC)
    // questions are drawn only into the strict mock, never a practice session.
    cache = [...getMockPool().questionById.values()]
      .filter((q) => !q.video)
      .map((q) => ({
        id: q.id,
        conceptId: q.conceptId,
        routeId: q.routeId,
        topic: q.conceptId.split('.')[1] ?? q.conceptId,
      }));
  }
  return cache;
}

export function getPracticeTopics(): PracticeTopic[] {
  const counts = new Map<string, number>();
  for (const q of getPracticePool()) counts.set(q.topic, (counts.get(q.topic) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count >= PRACTICE_MIN_POOL)
    .map(([topic, count]) => ({
      topic,
      label: topicLabel(topic),
      count,
    }))
    .sort((a, b) => a.topic.localeCompare(b.topic));
}

export function getWeakConceptIds(db: Db): string[] {
  return db
    .all<{ concept_id: string }>(
      `SELECT DISTINCT concept_id FROM review_item WHERE status IN ('active','snoozed') ORDER BY concept_id`,
    )
    .map((r) => r.concept_id);
}
