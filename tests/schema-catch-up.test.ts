/**
 * The sign-in outage, and the script that fixes it.
 *
 * Sign-in failed completely — Google and password alike — with two errors:
 *
 *     relation "rate_limits" does not exist              (42P01)
 *     column   "onboarding_completed_at" does not exist  (42703)
 *
 * Both are "the code is ahead of the database". BetterAuth queries
 * `rate_limits` on EVERY auth request (including `/get-session`, which every
 * page load makes) and `customSession` selects the whole `users` row, so one
 * missing column takes the entire auth funnel down.
 *
 * `scripts/catch-up-schema.sql` is the remedy. These tests run it against a
 * real Postgres (PGlite) so "it is safe to run" is a measured claim rather than
 * an assurance:
 *
 *   1. applied to an EMPTY database it produces everything the app queries;
 *   2. applied TWICE it succeeds both times (so it is safe on a database that
 *      already has some of it);
 *   3. applied to a database in the EXACT broken state above, it heals it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT = readFileSync(join(process.cwd(), 'scripts', 'catch-up-schema.sql'), 'utf8');

const hasTable = async (pg: PGlite, table: string) => {
  const r = await pg.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return r.rows[0].n === 1;
};

const hasColumn = async (pg: PGlite, table: string, column: string) => {
  const r = await pg.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return r.rows[0].n === 1;
};

const hasIndex = async (pg: PGlite, name: string) => {
  const r = await pg.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
    [name],
  );
  return r.rows[0].n === 1;
};

describe('catch-up applied to an empty database', () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(SCRIPT);
  }, 120_000);

  afterAll(async () => {
    await pg.close();
  });

  it('creates the table whose absence 500d every auth request', async () => {
    expect(await hasTable(pg, 'rate_limits')).toBe(true);
  });

  it('creates the column whose absence 500d sign-in', async () => {
    // `customSession` selects the whole users row, so this one column was
    // enough to break both Google and password sign-in.
    expect(await hasColumn(pg, 'users', 'onboarding_completed_at')).toBe(true);
    expect(await hasColumn(pg, 'users', 'user_role')).toBe(true);
  });

  it('creates every table the app queries', async () => {
    for (const table of [
      'users', 'sessions', 'accounts', 'tasks', 'events', 'event_recurrence',
      'calendars', 'docs', 'goals', 'goal_targets', 'planner_items',
      'focus_sessions', 'achievements', 'coin_transactions', 'daily_reward_caps',
      'mood_logs', 'push_subscriptions', 'integrations', 'contact_submissions',
      'notification_sends', 'rate_limits',
    ]) {
      expect(await hasTable(pg, table), table).toBe(true);
    }
  });

  it('creates the columns the later migrations add', async () => {
    expect(await hasColumn(pg, 'tasks', 'position')).toBe(true);
    expect(await hasColumn(pg, 'rate_limits', 'last_request')).toBe(true);
    expect(await hasColumn(pg, 'notification_sends', 'sent_at')).toBe(true);
  });

  it('creates the indexes the routes depend on', async () => {
    for (const index of [
      'rate_limits_key_uniq',
      'tasks_user_status_position_idx',
      'tasks_user_due_idx',
      'tasks_linked_event_uniq',
      'events_linked_task_uniq',
      'notification_sends_user_kind_date_uniq',
      'coin_tx_user_dedupe_uniq',
      'calendars_one_primary_local_per_user',
    ]) {
      expect(await hasIndex(pg, index), index).toBe(true);
    }
  });

  it('the exact query that 500d now succeeds', async () => {
    // The BetterAuth lookup from the error log, verbatim in shape.
    await expect(
      pg.query(
        `SELECT "id", "email", "onboarding_completed_at", "user_role"
           FROM "users" WHERE "users"."email" = $1`,
        ['nobody@example.invalid'],
      ),
    ).resolves.toBeDefined();

    await expect(
      pg.query(
        `SELECT "id", "key", "count", "last_request", "expires_at"
           FROM "rate_limits" WHERE "rate_limits"."key" = $1 LIMIT $2`,
        ['probe', 100],
      ),
    ).resolves.toBeDefined();
  });
});

describe('catch-up is safe to re-run', () => {
  it('applying it twice succeeds both times', async () => {
    // This is what makes it safe on a database that is only PARTLY migrated —
    // the state that caused the outage.
    const pg = new PGlite();
    try {
      await pg.exec(SCRIPT);
      await expect(pg.exec(SCRIPT)).resolves.toBeDefined();
      expect(await hasTable(pg, 'rate_limits')).toBe(true);
    } finally {
      await pg.close();
    }
  }, 180_000);
});

describe('catch-up heals the exact broken state', () => {
  it('adds only what is missing, and preserves existing rows', async () => {
    const pg = new PGlite();
    try {
      // Reproduce the reported database: `users` exists and has data, but the
      // 0021 columns and the `rate_limits` table do not.
      await pg.exec(`
        CREATE TABLE users (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          email varchar(255) NOT NULL UNIQUE,
          name varchar(255) NOT NULL,
          email_verified boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `);
      await pg.query(`INSERT INTO users (email, name) VALUES ($1, $2)`, [
        'existing@example.com',
        'Existing User',
      ]);

      expect(await hasColumn(pg, 'users', 'onboarding_completed_at')).toBe(false);
      expect(await hasTable(pg, 'rate_limits')).toBe(false);

      await pg.exec(SCRIPT);

      expect(await hasColumn(pg, 'users', 'onboarding_completed_at')).toBe(true);
      expect(await hasTable(pg, 'rate_limits')).toBe(true);

      // The pre-existing account is still there and still usable.
      const rows = await pg.query<{ email: string; name: string }>(
        `SELECT email, name FROM users WHERE email = $1`,
        ['existing@example.com'],
      );
      expect(rows.rows).toEqual([{ email: 'existing@example.com', name: 'Existing User' }]);
    } finally {
      await pg.close();
    }
  }, 180_000);
});

describe('catch-up is genuinely a no-op on a second run', () => {
  it('does NOT rewrite a task board the user has ordered by hand', async () => {
    // The 0022 seeding was guarded with `AND position = 0`, which LOOKS
    // one-shot and is not: position 0 is the normal state of the top card in
    // every column, and the default for every task created afterwards. A
    // re-run rewrote every top card to its created-at rank — destroying manual
    // order and creating duplicate positions. A board ordered C,A,B came back
    // C=2, A=1, B=2.
    const pg = new PGlite();
    try {
      await pg.exec(SCRIPT);

      const user = '11111111-1111-4111-8111-111111111111';
      await pg.query(`INSERT INTO users (id, email, name) VALUES ($1, $2, $3)`, [
        user,
        'ordering@example.com',
        'Ordering',
      ]);
      for (const [title, created] of [
        ['A', '2026-01-01T00:00:00Z'],
        ['B', '2026-01-02T00:00:00Z'],
        ['C', '2026-01-03T00:00:00Z'],
      ]) {
        await pg.query(
          `INSERT INTO tasks (user_id, title, status, created_at) VALUES ($1, $2, 'todo', $3)`,
          [user, title, created],
        );
      }

      // The user drags C to the top: C=0, A=1, B=2.
      for (const [title, pos] of [['C', 0], ['A', 1], ['B', 2]] as const) {
        await pg.query(`UPDATE tasks SET position = $1 WHERE user_id = $2 AND title = $3`, [
          pos,
          user,
          title,
        ]);
      }

      await pg.exec(SCRIPT);

      const rows = await pg.query<{ title: string; position: number }>(
        `SELECT title, position FROM tasks WHERE user_id = $1 ORDER BY position, title`,
        [user],
      );
      expect(rows.rows).toEqual([
        { title: 'C', position: 0 },
        { title: 'A', position: 1 },
        { title: 'B', position: 2 },
      ]);
    } finally {
      await pg.close();
    }
  }, 240_000);

  it('still seeds order the FIRST time, from created_at', async () => {
    // The guard must not be so strict that the seeding never runs at all.
    const pg = new PGlite();
    try {
      await pg.exec(SCRIPT);
      const user = '22222222-2222-4222-8222-222222222222';
      await pg.query(`INSERT INTO users (id, email, name) VALUES ($1, $2, $3)`, [
        user,
        'seed@example.com',
        'Seed',
      ]);
      // Pre-migration shape: every position at the column default.
      for (const [title, created] of [
        ['first', '2026-01-01T00:00:00Z'],
        ['second', '2026-01-02T00:00:00Z'],
      ]) {
        await pg.query(
          `INSERT INTO tasks (user_id, title, status, created_at, position)
           VALUES ($1, $2, 'todo', $3, 0)`,
          [user, title, created],
        );
      }

      await pg.exec(SCRIPT);

      const rows = await pg.query<{ title: string; position: number }>(
        `SELECT title, position FROM tasks WHERE user_id = $1 ORDER BY position`,
        [user],
      );
      expect(rows.rows).toEqual([
        { title: 'first', position: 0 },
        { title: 'second', position: 1 },
      ]);
    } finally {
      await pg.close();
    }
  }, 240_000);
});

describe('catch-up heals column drift, not just missing tables', () => {
  it('adds every column the app selects to an early-shaped users table', async () => {
    // `CREATE TABLE IF NOT EXISTS` sees the table and skips, so a `users` table
    // missing `coins` — or a dozen others — would still fail AFTER running the
    // script, with an error that looks identical to the original outage. Only
    // the two columns migration 0021 names were covered before.
    const pg = new PGlite();
    try {
      await pg.exec(`
        CREATE TABLE users (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          email varchar(255) NOT NULL UNIQUE,
          name text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `);
      await pg.query(`INSERT INTO users (email, name) VALUES ($1, $2)`, [
        'drift@example.com',
        'Drift',
      ]);

      await pg.exec(SCRIPT);

      // The full BetterAuth `customSession` read, verbatim from the error log.
      const res = await pg.query(
        `SELECT "id", "email", "name", "email_verified", "image", "avatar",
                "focus_session_length", "coins", "daily_streak", "best_daily_streak",
                "session_streak", "best_session_streak", "last_focus_date",
                "last_session_at", "timezone", "active_cosmetics", "owned_items",
                "consumables", "notification_preferences", "work_start", "work_end",
                "onboarding_completed_at", "user_role", "custom_categories",
                "short_break_mins", "long_break_mins", "sessions_per_cycle",
                "ambient_track", "created_at", "updated_at"
           FROM "users" WHERE "users"."email" = $1`,
        ['drift@example.com'],
      );
      expect(res.rows).toHaveLength(1);
      // Backfilled defaults are real values, not nulls.
      expect((res.rows[0] as { coins: number }).coins).toBe(0);
      expect((res.rows[0] as { timezone: string }).timezone).toBe('UTC');
    } finally {
      await pg.close();
    }
  }, 240_000);
});

describe('catch-up survives a rate_limits table with duplicate keys', () => {
  it('deduplicates before creating the unique index', async () => {
    // If `rate_limits` exists WITHOUT its unique index — the drift class this
    // script exists for — `CREATE UNIQUE INDEX` fails, the script aborts, and
    // every `ON CONFLICT ("key")` in the auth limiter then raises 42P10.
    const pg = new PGlite();
    try {
      await pg.exec(`
        CREATE TABLE rate_limits (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          key text NOT NULL,
          count integer NOT NULL DEFAULT 0,
          last_request bigint NOT NULL,
          expires_at timestamptz NOT NULL DEFAULT now() + interval '1 day'
        );
      `);
      await pg.query(
        `INSERT INTO rate_limits (key, count, last_request) VALUES ('dup', 3, 1), ('dup', 9, 2)`,
      );

      await pg.exec(SCRIPT);

      expect(await hasIndex(pg, 'rate_limits_key_uniq')).toBe(true);
      const rows = await pg.query<{ count: number }>(
        `SELECT count FROM rate_limits WHERE key = 'dup'`,
      );
      // One row survives, and it is the highest count — the conservative choice.
      expect(rows.rows).toEqual([{ count: 9 }]);
    } finally {
      await pg.close();
    }
  }, 240_000);
});

describe('catch-up never destroys anything', () => {
  it('contains no DROP TABLE, DROP COLUMN, TRUNCATE or unqualified DELETE', () => {
    // The whole point is that it can be run on a live database without a
    // maintenance window.
    expect(SCRIPT).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(SCRIPT).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(SCRIPT).not.toMatch(/\bTRUNCATE\b/i);
    // There is exactly ONE DELETE: the `rate_limits` key dedup, scoped by a
    // self-join and touching only ephemeral counter rows. Any other DELETE
    // appearing here should fail this test and be justified deliberately.
    const deletes = SCRIPT.match(/\bDELETE\s+FROM\s+"?\w+"?/gi) ?? [];
    expect(deletes.map((d) => d.replace(/\s+/g, ' ').toLowerCase())).toEqual([
      'delete from "rate_limits"',
    ]);
  });

  it('runs as one transaction, so a failure leaves nothing half-applied', () => {
    // Compared against the executable statements, not the raw text — the file
    // opens with a comment header, which is fine to have before BEGIN.
    const statements = SCRIPT.split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('--'));
    expect(statements[0]).toBe('BEGIN;');
    expect(statements.at(-1)).toBe('COMMIT;');
  });

  it('documents the psql flag that makes the transaction actually hold', () => {
    // Without ON_ERROR_STOP, psql keeps going after an error and sends COMMIT
    // to an already-aborted transaction — it rolls back while looking like it
    // succeeded.
    expect(SCRIPT).toContain('ON_ERROR_STOP=1');
  });

  it('covers every migration from the baseline forward', () => {
    for (const tag of [
      '0020_schema_baseline',
      '0021_onboarding_record',
      '0022_task_position',
      '0023_notification_sends',
      '0024_link_uniqueness',
    ]) {
      expect(SCRIPT, tag).toContain(tag);
    }
  });
});
