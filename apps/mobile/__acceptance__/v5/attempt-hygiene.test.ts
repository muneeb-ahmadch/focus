// Slice v5 gate: attempt lifecycle hygiene. Stale in_progress rows (killed
// sessions) become 'abandoned' — orphans were observed at the v2 smoke and
// must be gone before v8 readiness reads attempt history. Invariant: at most
// one in_progress attempt exists at any moment.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMission, getRouteManifest } from '@/content';
import type { Db } from '@/db/adapter';
import { migrate } from '@/db/migrations';
import { abandonStaleAttempts, finishAttempt, startAttempt } from '@/db/repo/attempts';
import { createProfile } from '@/db/repo/profile';
import { upsertMiss } from '@/db/repo/reviews';
import { syncRoutesFromContent } from '@/db/repo/routes';
import { openTestDb } from '@/db/testing/adapter.node';
import { addDaysLocal, todayLocal } from '@/lib/clock';
import { usePlayerStore } from '@/stores/playerStore';

const h = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('@/db', () => ({
  getDb: () => h.db as Db,
  initDb: async () => h.db as Db,
}));
vi.mock('expo-router', () => ({
  router: { replace: () => {}, back: () => {}, push: () => {} },
}));
vi.mock('@/notifications/scheduler', () => ({ rescheduleAll: async () => {} }));

let db: Db;

function inProgressCount(target: Db = db): number {
  return (
    target.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM attempt WHERE status = 'in_progress'`,
    )?.n ?? 0
  );
}

function seedStale(target: Db, n: number): void {
  for (let i = 0; i < n; i++) {
    target.run(
      `INSERT INTO attempt (attempt_type, content_id, status, started_at)
       VALUES ('lesson', 'stale-${i}', 'in_progress', '2026-07-01T10:00:00.000Z')`,
    );
  }
}

beforeEach(() => {
  db = openTestDb();
  migrate(db);
  syncRoutesFromContent(db, getRouteManifest());
  createProfile(db, { testDate: '2026-08-05', dailyMinutesTarget: 10 });
  h.db = db;
  usePlayerStore.getState().abandon();
});

describe('abandonStaleAttempts', () => {
  it('marks every in_progress row abandoned with a completion timestamp', () => {
    seedStale(db, 3);
    expect(inProgressCount()).toBe(3);

    abandonStaleAttempts(db);

    expect(inProgressCount()).toBe(0);
    const rows = db.all<{ status: string; completed_at: string | null }>(
      `SELECT status, completed_at FROM attempt`,
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.status).toBe('abandoned');
      expect(row.completed_at).toBeTruthy();
    }
  });

  it('leaves submitted and abandoned rows untouched', () => {
    const id = startAttempt(db, 'lesson', 'r1-m1');
    finishAttempt(db, id, 'submitted', 0.8, null);
    abandonStaleAttempts(db);
    const row = db.get<{ status: string; score: number }>(
      `SELECT status, score FROM attempt WHERE attempt_id = ?`,
      [id],
    );
    expect(row?.status).toBe('submitted');
    expect(row?.score).toBe(0.8);
  });
});

describe('terminal states are immutable', () => {
  it('finishAttempt cannot overwrite a submitted attempt (abandon after summary must not corrupt it)', () => {
    const id = startAttempt(db, 'drill', 'daily-drill');
    finishAttempt(db, id, 'submitted', 0.6, null);
    finishAttempt(db, id, 'abandoned', null, null);
    const row = db.get<{ status: string; score: number | null }>(
      `SELECT status, score FROM attempt WHERE attempt_id = ?`,
      [id],
    );
    expect(row?.status).toBe('submitted');
    expect(row?.score).toBe(0.6);
  });
});

describe('summary dismissal resets the session', () => {
  it('dismiss() after a drill summary deactivates the store without corrupting the attempt', () => {
    const concept = getMission('r1-m1')!.steps.find((s) => s.type !== 'checkpoint')!.conceptId;
    upsertMiss(db, concept, 'wrong', addDaysLocal(todayLocal(), -1));
    usePlayerStore.getState().startDrill();
    expect(usePlayerStore.getState().active).toBe(true);
    expect(usePlayerStore.getState().queue.length).toBeGreaterThan(0);

    while (usePlayerStore.getState().phase !== 'drill-summary') {
      const s = usePlayerStore.getState();
      const card = s.queue[s.index];
      if (!card) break;
      if (s.phase === 'card' && card.kind !== 'step') {
        const correct = card.question.options.find((o) => o.correct)!;
        s.answer(correct.id);
      } else if (s.phase === 'feedback') {
        s.confirmConfidence('okay');
      } else {
        break;
      }
    }
    expect(usePlayerStore.getState().phase).toBe('drill-summary');
    const attempt = db.get<{ status: string }>(
      `SELECT status FROM attempt ORDER BY attempt_id DESC LIMIT 1`,
    );
    expect(attempt?.status).toBe('submitted');

    usePlayerStore.getState().dismiss();
    expect(usePlayerStore.getState().active).toBe(false);
    const after = db.get<{ status: string }>(
      `SELECT status FROM attempt ORDER BY attempt_id DESC LIMIT 1`,
    );
    expect(after?.status).toBe('submitted');
  });

  it('dismiss() is phase-guarded: it does nothing mid-card', () => {
    usePlayerStore.getState().startMission('r1-m1');
    usePlayerStore.getState().dismiss();
    const s = usePlayerStore.getState();
    expect(s.active).toBe(true);
    expect(s.phase).toBe('card');
  });
});

describe('in_progress invariant', () => {
  it('startAttempt sweeps stale rows: never more than one in_progress', () => {
    seedStale(db, 2);
    startAttempt(db, 'lesson', 'r1-m1');
    expect(inProgressCount()).toBe(1);
  });

  it('holds under a random start/finish/kill sequence', () => {
    let s = 42 >>> 0;
    const rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
    let openId: number | null = null;
    for (let i = 0; i < 200; i++) {
      const op = Math.floor(rng() * 3);
      if (op === 0) {
        openId = startAttempt(db, rng() < 0.5 ? 'lesson' : 'drill', `content-${i}`);
      } else if (op === 1 && openId !== null) {
        finishAttempt(db, openId, rng() < 0.5 ? 'submitted' : 'abandoned', rng(), null);
        openId = null;
      }
      // op === 2 simulates a kill: nothing is closed, next start must sweep
      expect(inProgressCount()).toBeLessThanOrEqual(1);
    }
  });

  it('a killed mission session is swept when the next session starts anything', () => {
    usePlayerStore.getState().startMission('r1-m1');
    expect(inProgressCount()).toBe(1);

    // simulate kill: fresh store boot, no abandon() ran
    usePlayerStore.setState({ active: false });
    usePlayerStore.getState().startMission('r1-m2');

    expect(inProgressCount()).toBe(1);
    const open = db.get<{ content_id: string }>(
      `SELECT content_id FROM attempt WHERE status = 'in_progress'`,
    );
    expect(open?.content_id).toBe('r1-m2');
  });
});
