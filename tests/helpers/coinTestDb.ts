/**
 * In-process Postgres (PGlite, WASM) for coin-economy exploit tests. Nothing
 * connects to any real database — each test spins up an ephemeral instance and
 * runs the SAME SQL the app runs (jsonb_set, partial unique indexes, ON CONFLICT,
 * FOR UPDATE, CHECK constraints), so the regression tests exercise the real
 * idempotency / cap / guard behaviour rather than mocks.
 *
 * NOTE: PGlite is a single in-process connection, so "concurrent" Promise.all
 * calls execute serialized. That still proves the guard invariants (exactly one
 * spend succeeds, balance never negative, cap clamps) — but true parallel
 * row-lock contention would need a multi-connection Postgres.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/db/schema';

// Focused subset of the real schema — only the tables the coin path touches,
// with the exact constraints/indexes from migrations 0018/0019.
const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coins integer NOT NULL DEFAULT 0,
  consumables jsonb DEFAULT '{}'::jsonb,
  owned_items jsonb DEFAULT '[]'::jsonb,
  daily_streak integer NOT NULL DEFAULT 0,
  best_daily_streak integer NOT NULL DEFAULT 0,
  session_streak integer NOT NULL DEFAULT 0,
  best_session_streak integer NOT NULL DEFAULT 0,
  last_focus_date date,
  last_session_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_coins_nonneg CHECK (coins >= 0)
);
CREATE TABLE IF NOT EXISTS coin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  reason varchar(100) NOT NULL,
  label varchar(255) NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  dedupe_key varchar(200),
  source_type varchar(100),
  source_id varchar(255),
  balance_after integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS coin_tx_user_dedupe_uniq
  ON coin_transactions (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS daily_reward_caps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason varchar(100) NOT NULL,
  bucket_date date NOT NULL,
  used_units integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_reward_caps_used_nonneg CHECK (used_units >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_reward_caps_user_reason_date_uniq
  ON daily_reward_caps (user_id, reason, bucket_date);
`;

export type CoinTestDb = Awaited<ReturnType<typeof makeCoinTestDb>>;

export async function makeCoinTestDb() {
  const client = new PGlite();
  await client.exec(DDL);
  const db = drizzle(client, { schema });
  return { db, client };
}

/** Insert a test user via raw SQL (avoids the real users table's other NOT NULL cols). */
export async function seedUser(
  client: PGlite,
  opts: { coins?: number; consumables?: Record<string, number> } = {},
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO users (coins, consumables) VALUES ($1, $2::jsonb) RETURNING id`,
    [opts.coins ?? 0, JSON.stringify(opts.consumables ?? {})],
  );
  return res.rows[0].id;
}

export async function getCoins(client: PGlite, userId: string): Promise<number> {
  const res = await client.query<{ coins: number }>(`SELECT coins FROM users WHERE id = $1`, [userId]);
  return res.rows[0].coins;
}
