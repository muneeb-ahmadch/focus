import { randomUUID } from 'expo-crypto';
import { AppState } from 'react-native';
import { getDb } from '@/db';
import { getMeta, setMeta } from '@/db/repo/meta';
import { ANALYTICS_URL } from '@/flags';
import { now } from '@/lib/clock';

export type AnalyticsEventName =
  | 'app_open'
  | 'onboarding_completed'
  | 'mission_started'
  | 'mission_completed'
  | 'checkpoint_failed'
  | 'drill_completed'
  | 'rehab_completed'
  | 'practice_completed'
  | 'mock_started'
  | 'mock_completed';

export type AnalyticsProps = Record<string, string | number | boolean>;

export const FLUSH_BATCH_SIZE = 50;

export function getInstallId(): string {
  const db = getDb();
  const existing = getMeta(db, 'install_id');
  if (existing) return existing;
  const id = randomUUID();
  setMeta(db, 'install_id', id);
  return id;
}

export function track(name: AnalyticsEventName, props?: AnalyticsProps): void {
  try {
    const db = getDb();
    db.run(
      `INSERT INTO analytics_event (event_id, name, occurred_at, props_json) VALUES (?, ?, ?, ?)`,
      [randomUUID(), name, now().toISOString(), JSON.stringify(props ?? {})],
    );
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('analytics track failed', err);
  }
}

interface QueueRow {
  event_id: string;
  name: string;
  occurred_at: string;
  props_json: string;
}

function parseProps(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function drain(fetchFn: typeof fetch): Promise<void> {
  if (!ANALYTICS_URL) return;
  const db = getDb();
  const installId = getInstallId();
  for (;;) {
    const rows = db.all<QueueRow>(
      'SELECT event_id, name, occurred_at, props_json FROM analytics_event ORDER BY rowid LIMIT ?',
      [FLUSH_BATCH_SIZE],
    );
    if (rows.length === 0) return;

    const body = {
      install_id: installId,
      events: rows.map((r) => ({
        event_id: r.event_id,
        name: r.name,
        occurred_at: r.occurred_at,
        props: parseProps(r.props_json),
      })),
    };

    let res: Response;
    try {
      res = await fetchFn(ANALYTICS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      return;
    }

    if (res.ok || res.status === 422) {
      db.transaction(() => {
        for (const row of rows) {
          db.run('DELETE FROM analytics_event WHERE event_id = ?', [row.event_id]);
        }
        return undefined;
      });
      continue;
    }
    return;
  }
}

let inFlight: Promise<void> | null = null;

export function flush(fetchFn: typeof fetch = fetch): Promise<void> {
  if (inFlight) return inFlight;
  const p = drain(fetchFn).finally(() => {
    inFlight = null;
  });
  inFlight = p;
  return p;
}

let booted = false;

export function bootAnalytics(): void {
  if (booted) return;
  booted = true;
  track('app_open');
  void flush();
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void flush();
  });
}
