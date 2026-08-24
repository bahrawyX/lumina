/**
 * In-process Postgres (PGlite) for the Batch 5 cross-user access tests. Seeds
 * the tables the affected route handlers touch so the tests can create data as
 * user A and attempt access as user B against the REAL handler / real SQL.
 *
 * Enum columns are declared as `text` (the runtime sends the string anyway).
 * FK constraints are intentionally omitted so a test can seed a deliberately
 * cross-user row (simulating data written before a fix) without the DB blocking
 * it — that's the scenario the aggregation-scoping layer must survive.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/db/schema';

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
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title varchar(512) NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo',
  priority text NOT NULL DEFAULT 'medium',
  difficulty text NOT NULL DEFAULT 'medium',
  estimated_minutes integer NOT NULL DEFAULT 30,
  due_date timestamptz,
  scheduled_start varchar(5),
  scheduled_end varchar(5),
  remaining_focus_time integer,
  linked_event_id uuid,
  linked_doc_id uuid,
  goal_id uuid,
  parent_task_id uuid,
  depth integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS planner_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id uuid NOT NULL,
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz NOT NULL DEFAULT now(),
  is_auto_scheduled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title varchar(255) NOT NULL DEFAULT 'goal',
  description text,
  emoji varchar(10),
  color varchar(20),
  status text NOT NULL DEFAULT 'active',
  timeframe text NOT NULL DEFAULT 'custom',
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS goal_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL,
  title varchar(255) NOT NULL DEFAULT 'target',
  description text,
  type text NOT NULL DEFAULT 'number',
  current_value numeric(10,2) NOT NULL DEFAULT '0',
  target_value numeric(10,2) NOT NULL DEFAULT '1',
  unit varchar(50),
  linked_task_ids text,
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Full column set: the intelligence handler does select().from(events), so
-- every schema column must exist even when no rows are seeded.
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  calendar_id uuid,
  title varchar(512) NOT NULL DEFAULT 'event',
  description text,
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz NOT NULL DEFAULT now(),
  is_all_day boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'UTC',
  category varchar(64),
  color varchar(32),
  completed boolean NOT NULL DEFAULT false,
  linked_task_id uuid,
  location varchar(512),
  provider text NOT NULL DEFAULT 'local',
  external_event_id text,
  external_etag text,
  source_updated_at timestamptz,
  sync_status text NOT NULL DEFAULT 'local_only',
  meeting_url text,
  organizer_email text,
  is_task_generated boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual',
  external_id varchar(255),
  last_synced_at timestamptz,
  recurring_event_id uuid,
  original_start_time timestamptz,
  is_recurrence_exception boolean NOT NULL DEFAULT false,
  created_via_nl boolean NOT NULL DEFAULT false,
  reminder_sent_at timestamptz,
  linked_doc_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  parent_id uuid,
  title varchar(512) NOT NULL DEFAULT 'Untitled',
  icon varchar(64),
  content jsonb,
  content_text text NOT NULL DEFAULT '',
  word_count integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  is_pinned boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  linked_task_id uuid,
  linked_event_id uuid,
  cover_image text,
  cover_gradient text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mood_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  focus_session_id uuid,
  mood varchar(16) NOT NULL,
  note text,
  logged_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS focus_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id uuid,
  task_title varchar(512),
  goal_id uuid,
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz NOT NULL DEFAULT now(),
  duration_minutes integer NOT NULL DEFAULT 25,
  coins_earned integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
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
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_reward_caps_user_reason_date_uniq
  ON daily_reward_caps (user_id, reason, bucket_date);
`;

export type MultiUserTestDb = Awaited<ReturnType<typeof makeMultiUserTestDb>>;

export async function makeMultiUserTestDb() {
  const client = new PGlite();
  await client.exec(DDL);
  const db = drizzle(client, { schema });
  return { db, client };
}

export async function seedUser(client: PGlite): Promise<string> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO users (coins) VALUES (0) RETURNING id`,
  );
  return res.rows[0].id;
}
