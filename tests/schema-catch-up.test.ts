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

describe('catch-up never destroys anything', () => {
  it('contains no DROP TABLE, DROP COLUMN, TRUNCATE or unqualified DELETE', () => {
    // The whole point is that it can be run on a live database without a
    // maintenance window.
    expect(SCRIPT).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(SCRIPT).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(SCRIPT).not.toMatch(/\bTRUNCATE\b/i);
    // 0024 has UPDATEs (link repair) but no DELETE.
    expect(SCRIPT).not.toMatch(/\bDELETE\s+FROM\b/i);
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
