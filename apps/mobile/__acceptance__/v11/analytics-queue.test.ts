// @vitest-environment jsdom
// Slice v11 gate: the analytics queue is a durable SQLite outbox. track()
// never throws and never blocks; flush() delivers oldest-first batches of
// ≤FLUSH_BATCH_SIZE with exactly-once semantics against a flaky network —
// retain on network error/5xx/429, drop-the-batch-and-continue on 422 (a
// permanently rejected batch must never wedge the queue) — is single-flight,
// and is a structural no-op until an upload URL is configured. The install id
// is an anonymous uuid minted into app_meta, never a device identifier.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { getMeta } from '@/db/repo/meta';
import { openTestDb } from '@/db/testing/adapter.node';
import { FLUSH_BATCH_SIZE, flush, getInstallId, track } from '@/lib/analytics';

const h = vi.hoisted(() => ({
  db: null as unknown,
  nowMs: 1_780_000_000_000,
  url: 'https://api.test/v1/analytics' as string | null,
}));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('@/lib/clock', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/clock')>();
  return {
    ...real,
    now: () => new Date(h.nowMs),
    todayLocal: () => real.toLocalDay(new Date(h.nowMs)),
  };
});
vi.mock('expo-crypto', async () => {
  const { randomUUID } = await import('node:crypto');
  return { randomUUID };
});
vi.mock('@/flags', () => ({
  MOCKS_ENABLED: true,
  get ANALYTICS_URL() {
    return h.url;
  },
}));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface QueueRow {
  event_id: string;
  name: string;
  occurred_at: string;
  props_json: string;
}

interface SentEvent {
  event_id: string;
  name: string;
  occurred_at: string;
  props: Record<string, unknown>;
}

interface SentBatch {
  url: string;
  method: string | undefined;
  contentType: string | undefined;
  body: { install_id: string; events: SentEvent[] };
}

let db: Db;

const rows = (): QueueRow[] =>
  db.all<QueueRow>(
    'SELECT event_id, name, occurred_at, props_json FROM analytics_event ORDER BY rowid',
  );

type FetchOutcome = { ok: boolean; status: number } | 'reject';

function mockFetch(responder: (call: number) => FetchOutcome) {
  const batches: SentBatch[] = [];
  const outcomes: FetchOutcome[] = [];
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const call = fn.mock.calls.length;
    const outcome = responder(call);
    outcomes.push(outcome);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    batches.push({
      url: String(url),
      method: init?.method,
      contentType: headers['Content-Type'] ?? headers['content-type'],
      body: JSON.parse(String(init?.body)) as SentBatch['body'],
    });
    if (outcome === 'reject') throw new Error('network down');
    return { ok: outcome.ok, status: outcome.status } as unknown as Response;
  });
  const delivered = (): SentEvent[] =>
    batches.filter((_, i) => outcomes[i] !== 'reject' && (outcomes[i] as { ok: boolean }).ok)
      .flatMap((b) => b.body.events);
  return { fn: fn as unknown as typeof fetch, raw: fn, batches, delivered };
}

const ok200 = () => mockFetch(() => ({ ok: true, status: 200 }));

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  h.db = db;
  h.url = 'https://api.test/v1/analytics';
  h.nowMs = 1_780_000_000_000;
});

describe('install id', () => {
  it('is a uuid persisted in app_meta and stable across calls', () => {
    const id = getInstallId();
    expect(id).toMatch(UUID_RE);
    expect(getMeta(db, 'install_id')).toBe(id);
    expect(getInstallId()).toBe(id);
  });

  it('a different database yields a different id — the id is the install, nothing else', () => {
    const first = getInstallId();
    const other = openTestDb();
    migrate(other);
    h.db = other;
    const second = getInstallId();
    expect(second).toMatch(UUID_RE);
    expect(second).not.toBe(first);
  });
});

describe('track', () => {
  it('queues a row with a uuid event id, the clock time, and empty props by default', () => {
    track('app_open');
    const all = rows();
    expect(all).toHaveLength(1);
    expect(all[0].event_id).toMatch(UUID_RE);
    expect(all[0].name).toBe('app_open');
    expect(all[0].occurred_at).toBe(new Date(h.nowMs).toISOString());
    expect(all[0].props_json).toBe('{}');
  });

  it('round-trips props as JSON', () => {
    track('mission_completed', { mission_id: 'r1-m1', score: 1 });
    expect(JSON.parse(rows()[0].props_json)).toEqual({ mission_id: 'r1-m1', score: 1 });
  });

  it('two identical events get distinct event ids', () => {
    track('app_open');
    track('app_open');
    const all = rows();
    expect(all).toHaveLength(2);
    expect(all[0].event_id).not.toBe(all[1].event_id);
  });

  it('never throws, even when the queue table is gone', () => {
    db.exec('DROP TABLE analytics_event');
    expect(() => track('app_open')).not.toThrow();
  });
});

describe('flush', () => {
  it('batch size constant is 50', () => {
    expect(FLUSH_BATCH_SIZE).toBe(50);
  });

  it('delivers the queue in one POST and deletes it on ack', async () => {
    track('app_open');
    track('mission_started', { mission_id: 'r1-m1' });
    track('mission_completed', { mission_id: 'r1-m1', score: 1 });
    const { fn, batches } = ok200();
    await flush(fn);
    expect(batches).toHaveLength(1);
    expect(batches[0].url).toBe('https://api.test/v1/analytics');
    expect(batches[0].method).toBe('POST');
    expect(batches[0].contentType).toBe('application/json');
    expect(batches[0].body.install_id).toBe(getInstallId());
    expect(batches[0].body.events.map((e) => e.name)).toEqual([
      'app_open',
      'mission_started',
      'mission_completed',
    ]);
    expect(batches[0].body.events[1].props).toEqual({ mission_id: 'r1-m1' });
    expect(batches[0].body.events[1].occurred_at).toBe(new Date(h.nowMs).toISOString());
    expect(rows()).toHaveLength(0);
  });

  it('splits into oldest-first batches of at most 50', async () => {
    for (let i = 0; i < 120; i++) track('app_open', { i });
    const { fn, batches } = ok200();
    await flush(fn);
    expect(batches.map((b) => b.body.events.length)).toEqual([50, 50, 20]);
    expect(batches[0].body.events[0].props).toEqual({ i: 0 });
    expect(batches[0].body.events[49].props).toEqual({ i: 49 });
    expect(batches[2].body.events[19].props).toEqual({ i: 119 });
    expect(rows()).toHaveLength(0);
  });

  it('a network failure retains every event and resolves without throwing', async () => {
    for (let i = 0; i < 3; i++) track('app_open', { i });
    const { fn } = mockFetch(() => 'reject');
    await expect(flush(fn)).resolves.toBeUndefined();
    expect(rows()).toHaveLength(3);
  });

  it('delivers every event exactly once across an outage and reconnect', async () => {
    for (let i = 0; i < 60; i++) track('app_open', { i });
    const first = mockFetch(() => 'reject');
    await flush(first.fn);
    expect(rows()).toHaveLength(60);

    const second = ok200();
    await flush(second.fn);
    expect(rows()).toHaveLength(0);
    const seen = second.delivered().map((e) => e.event_id);
    expect(seen).toHaveLength(60);
    expect(new Set(seen).size).toBe(60);
  });

  it('a 500 stops the flush and retains the queue', async () => {
    for (let i = 0; i < 60; i++) track('app_open', { i });
    const { fn, raw } = mockFetch(() => ({ ok: false, status: 500 }));
    await flush(fn);
    expect(raw).toHaveBeenCalledTimes(1);
    expect(rows()).toHaveLength(60);
  });

  it('a 429 stops the flush and retains the queue', async () => {
    track('app_open');
    const { fn } = mockFetch(() => ({ ok: false, status: 429 }));
    await flush(fn);
    expect(rows()).toHaveLength(1);
  });

  it('a 422 drops that batch and continues — a poisoned batch never wedges the queue', async () => {
    for (let i = 0; i < 60; i++) track('app_open', { i });
    const { fn, batches } = mockFetch((call) =>
      call === 1 ? { ok: false, status: 422 } : { ok: true, status: 200 },
    );
    await flush(fn);
    expect(batches).toHaveLength(2);
    expect(batches[1].body.events.map((e) => e.props)).toEqual(
      Array.from({ length: 10 }, (_, i) => ({ i: 50 + i })),
    );
    expect(rows()).toHaveLength(0);
  });

  it('is single-flight — a concurrent flush never double-sends', async () => {
    track('app_open');
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fn = vi.fn(async () => {
      await gate;
      return { ok: true, status: 200 } as unknown as Response;
    });
    const p1 = flush(fn as unknown as typeof fetch);
    const p2 = flush(fn as unknown as typeof fetch);
    release();
    await Promise.all([p1, p2]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(rows()).toHaveLength(0);
  });

  it('is a no-op while no upload URL is configured', async () => {
    track('app_open');
    h.url = null;
    const { fn, raw } = ok200();
    await flush(fn);
    expect(raw).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(1);
  });

  it('a row with corrupt props_json is still delivered, with empty props (R1)', async () => {
    db.run(
      `INSERT INTO analytics_event (event_id, name, occurred_at, props_json)
       VALUES ('44444444-4444-4444-8444-444444444444', 'app_open', '2026-07-14T09:00:00.000Z', 'not-json')`,
    );
    track('mission_started', { mission_id: 'r1-m1' });
    const { fn, batches } = ok200();
    await flush(fn);
    expect(batches).toHaveLength(1);
    expect(batches[0].body.events[0].props).toEqual({});
    expect(batches[0].body.events[1].props).toEqual({ mission_id: 'r1-m1' });
    expect(rows()).toHaveLength(0);
  });

  it('drains 10,000 queued events in exactly 200 batches (QA charter)', async () => {
    db.transaction(() => {
      for (let i = 0; i < 10_000; i++) {
        db.run(
          `INSERT INTO analytics_event (event_id, name, occurred_at, props_json)
           VALUES (?, 'app_open', '2026-07-14T09:00:00.000Z', '{}')`,
          [`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`],
        );
      }
      return undefined;
    });
    const { fn, raw } = ok200();
    await flush(fn);
    expect(raw).toHaveBeenCalledTimes(200);
    expect(rows()).toHaveLength(0);
  });
});
