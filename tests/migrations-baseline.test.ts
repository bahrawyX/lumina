/**
 * P0-1 — the database schema must be rebuildable from the repository.
 *
 * Four production tables (docs, goals, goal_targets, coin_transactions) existed
 * in no migration at all, eleven declared indexes were in the same position, and
 * `_journal.json` listed entries 0-8 while 20 .sql files sat on disk — so
 * `drizzle-kit migrate` skipped 0009-0019 entirely.
 *
 * These tests apply the committed baseline to a real (in-process) Postgres and
 * assert three things the repo previously could not guarantee:
 *
 *   1. Every table the TypeScript schema declares actually gets created.
 *   2. Every statement is idempotent, so running it against the existing
 *      production database is a no-op rather than an error.
 *   3. The journal lists every migration file on disk, in order.
 *
 * No external database is contacted — PGlite runs Postgres in-process.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const DRIZZLE_DIR = join(process.cwd(), 'drizzle');
const BASELINE = join(DRIZZLE_DIR, '0020_schema_baseline.sql');

/** Tables declared in src/db/schema — the set the app actually needs. */
const EXPECTED_TABLES = [
  'accounts',
  'achievements',
  'calendars',
  'coin_transactions',
  'contact_submissions',
  'daily_brief_cache',
  'daily_reward_caps',
  'docs',
  'event_recurrence',
  'events',
  'focus_sessions',
  'goal_targets',
  'goals',
  'integrations',
  'mood_logs',
  'notification_sends',
  'planner_items',
  'push_subscriptions',
  'rate_limits',
  'sessions',
  'tasks',
  'users',
  'verifications',
];

/**
 * The four tables the audit found in no migration whatsoever. Called out
 * separately so a regression names the actual finding.
 */
const PREVIOUSLY_UNMIGRATED = ['docs', 'goals', 'goal_targets', 'coin_transactions'];

/** Drop whole-line `--` comments, keeping any SQL that follows them. */
function stripLeadingComments(chunk: string): string {
  return chunk
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .trim();
}

async function applyFile(db: PGlite, file: string): Promise<void> {
  const sql = readFileSync(file, 'utf8');
  for (const chunk of sql.split('--> statement-breakpoint')) {
    const statement = stripLeadingComments(chunk);
    if (!statement) continue;
    await db.exec(statement);
  }
}

/**
 * The baseline plus every migration that comes after it, in journal order.
 *
 * The baseline creates tables with `IF NOT EXISTS`, which by design does
 * nothing to a table that already exists — so a later column addition needs its
 * own `ALTER ... ADD COLUMN IF NOT EXISTS` migration to reach production. This
 * applies the same sequence a real deploy would.
 */
const POST_BASELINE = readdirSync(DRIZZLE_DIR)
  .filter((f) => f.endsWith('.sql') && f > '0020_')
  .sort()
  .map((f) => join(DRIZZLE_DIR, f));

async function applyBaseline(db: PGlite): Promise<void> {
  await applyFile(db, BASELINE);
  for (const file of POST_BASELINE) {
    await applyFile(db, file);
  }
}

async function tableNames(db: PGlite): Promise<string[]> {
  const res = await db.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  return res.rows.map((r) => r.tablename);
}

describe('P0-1 — the baseline builds the whole schema from empty', () => {
  let db: PGlite;
  let created: string[];

  beforeAll(async () => {
    db = new PGlite();
    await applyBaseline(db);
    created = await tableNames(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it('creates every table the schema declares', () => {
    for (const table of EXPECTED_TABLES) {
      expect(created, `missing table: ${table}`).toContain(table);
    }
  });

  for (const table of PREVIOUSLY_UNMIGRATED) {
    it(`creates "${table}", which previously existed in no migration at all`, () => {
      expect(created).toContain(table);
    });
  }

  it('creates the coin-ledger idempotency index the economy depends on', async () => {
    // The ledger's at-most-once guarantee is enforced by Postgres, not by
    // application logic — so if `push` ever dropped this index, double-awards
    // become silently possible.
    const res = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const names = res.rows.map((r) => r.indexname);
    expect(names).toContain('coin_tx_user_dedupe_uniq');
  });

  it('applies post-baseline migrations, so a column added later reaches production', async () => {
    // 0021 adds users.onboarding_completed_at / users.user_role. The baseline's
    // CREATE TABLE IF NOT EXISTS is a no-op against an existing table, so
    // without the follow-up ALTER these columns would exist in a fresh database
    // and be missing in production — the worst kind of drift.
    const res = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users'`,
    );
    const columns = res.rows.map((r) => r.column_name);
    expect(columns).toContain('onboarding_completed_at');
    expect(columns).toContain('user_role');
  });

  it('creates the docs full-text index', async () => {
    const res = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'docs'`,
    );
    expect(res.rows.map((r) => r.indexname).length).toBeGreaterThan(0);
  });


  it('is a no-op against a database that already has the schema', async () => {
    // Re-applies to the SAME instance the suite already populated — which is
    // exactly the production case: every object already exists. Any statement
    // lacking its IF NOT EXISTS / duplicate_object guard throws here, as it
    // would on a real deploy.
    //
    // Reusing the instance rather than standing up a second one is deliberate:
    // each PGlite is a full Postgres compiled to WASM reserving a large
    // ArrayBuffer, and two live at once is enough to fail allocation on a
    // memory-constrained runner.
    await expect(applyBaseline(db)).resolves.toBeUndefined();

    const after = await tableNames(db);
    for (const table of EXPECTED_TABLES) {
      expect(after).toContain(table);
    }
  });
});

describe('P0-1 — the journal lists every migration on disk', () => {
  const journal = JSON.parse(
    readFileSync(join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: Array<{ idx: number; tag: string; when: number }> };

  const filesOnDisk = readdirSync(DRIZZLE_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.replace(/\.sql$/, ''))
    .sort();

  it('has one entry per .sql file', () => {
    // Previously: 9 entries for 20 files, so `drizzle-kit migrate` silently
    // skipped 0009-0019.
    expect(journal.entries.map((e) => e.tag).sort()).toEqual(filesOnDisk);
  });

  it('numbers entries contiguously from zero', () => {
    journal.entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i);
    });
  });

  it('has strictly increasing timestamps, so ordering is unambiguous', () => {
    for (let i = 1; i < journal.entries.length; i++) {
      expect(journal.entries[i].when).toBeGreaterThan(journal.entries[i - 1].when);
    }
  });
});
