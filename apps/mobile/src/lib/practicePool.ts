import { PRACTICE_MIN_POOL, type PracticePoolQuestion } from '@focus/engine';
import type { Db } from '@/db/adapter';
import { getMockPool } from './mockPool';

export interface PracticeTopic {
  topic: string;
  label: string;
  count: number;
}

let cache: PracticePoolQuestion[] | null = null;

export function getPracticePool(): PracticePoolQuestion[] {
  if (!cache) {
    cache = [...getMockPool().questionById.values()].map((q) => ({
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
      label: topic.charAt(0).toUpperCase() + topic.slice(1),
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
