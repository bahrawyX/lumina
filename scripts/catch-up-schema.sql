-- ============================================================================
-- catch-up-schema.sql — bring ANY Lumina database up to the current schema
--
-- ## Why this exists
--
-- Sign-in was failing completely — every method, Google and password alike —
-- with two errors underneath:
--
--     relation "rate_limits" does not exist              (42P01)
--     column   "onboarding_completed_at" does not exist  (42703)
--
-- Both are "the code is ahead of the database": migrations 0020-0025 had not
-- been applied. BetterAuth queries `rate_limits` on EVERY auth request
-- (including /get-session, which every page load makes) and `customSession`
-- selects the whole `users` row, so a single missing column takes the entire
-- auth funnel down.
--
-- ## Why not `npm run db:migrate`
--
-- Try that first — it is the normal path. This file is for the case that
-- produced the outage: a database whose `__drizzle_migrations` journal does not
-- match what is actually in it, where drizzle-kit would either re-run 0000 (and
-- fail on "relation already exists") or skip work that is genuinely missing.
--
-- ## How to run it
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/catch-up-schema.sql
--
-- `ON_ERROR_STOP=1` matters. The whole file is wrapped in BEGIN/COMMIT, but
-- psql without that flag keeps going after an error, which would send the
-- COMMIT after the transaction had already aborted and roll everything back
-- while looking like it worked. With the flag, any error aborts and rolls back
-- cleanly, leaving the database exactly as it was.
--
-- On Neon, paste the file into the SQL Editor (it runs statements in one
-- session, and the BEGIN/COMMIT below applies).
--
-- ## Safety
--
-- Every statement is idempotent: `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
-- or a `DO $$ ... EXCEPTION $$` guard. Running it on an already-current
-- database is a no-op; running it twice is a no-op. It creates and backfills —
-- it never drops a table, drops a column, or truncates.
--
-- Verified in `tests/schema-catch-up.test.ts` against a real Postgres: applied
-- to an empty database it produces every table, column and index the app
-- queries; applied to a database in the exact broken state above it heals it;
-- applied twice it is a no-op INCLUDING task ordering; and it repairs a
-- `users` table missing arbitrary columns, not just the two that migration
-- 0021 names.
-- ============================================================================

BEGIN;



-- ==========================================================================
-- 0020_schema_baseline
-- ==========================================================================

-- ============================================================================
-- 0020_schema_baseline
--
-- A COMPLETE, IDEMPOTENT baseline for the entire schema, generated from
-- src/db/schema/*.ts by drizzle-kit (no database was contacted to produce it).
--
-- Why this file exists
-- --------------------
-- Four production tables -- docs, goals, goal_targets and coin_transactions --
-- existed in NO migration at all. They were defined only in the TypeScript
-- schema and reached production via `drizzle-kit push`. Eleven declared indexes
-- were in the same position, including the docs full-text GIN index and
-- coin_tx_user_created_idx.
--
-- On top of that, drizzle/meta/_journal.json listed entries 0-8 while 20 .sql
-- files sat on disk, so `drizzle-kit migrate` skipped 0009-0019 entirely.
--
-- Net effect: the database could not be rebuilt from the repository. You could
-- not stand up a new environment, could not roll back a schema change, and did
-- not know what any given environment actually had.
--
-- Every statement here is idempotent
-- ----------------------------------
--   CREATE TABLE / CREATE INDEX  -> IF NOT EXISTS
--   CREATE TYPE                  -> DO block swallowing duplicate_object
--   ADD CONSTRAINT               -> DO block swallowing duplicate_object
--
-- So this is a no-op against the existing production database and produces the
-- full, correct schema against an empty one. It is additive only: nothing here
-- drops, alters or recreates an existing object, and no data is touched.
--
-- The historical 0000-0019 files are kept for the record and remain listed in
-- the journal ahead of this one, so an environment part-way through the old
-- chain still converges here.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "public"."calendar_provider" AS ENUM('google', 'microsoft', 'local');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."event_provider" AS ENUM('local', 'google', 'outlook');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."event_source" AS ENUM('manual', 'google', 'microsoft', 'scheduler');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."event_sync_status" AS ENUM('local_only', 'synced', 'pending_update', 'pending_delete');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."goal_status" AS ENUM('active', 'completed', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."goal_timeframe" AS ENUM('weekly', 'monthly', 'quarterly', 'yearly', 'custom');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."target_type" AS ENUM('number', 'percentage', 'boolean', 'task_completion');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."task_difficulty" AS ENUM('easy', 'medium', 'hard');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."task_status" AS ENUM('todo', 'doing', 'done');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."integration_provider" AS ENUM('google', 'microsoft', 'outlook');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."integration_status" AS ENUM('active', 'disconnected', 'error');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(64) NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "calendar_provider" NOT NULL,
	"external_id" varchar(255),
	"name" varchar(255) NOT NULL,
	"color" varchar(32) DEFAULT '#6D59E0' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coin_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason" varchar(100) NOT NULL,
	"label" varchar(255) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"dedupe_key" varchar(200),
	"source_type" varchar(100),
	"source_id" varchar(255),
	"balance_after" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"type" varchar(32) NOT NULL,
	"subject" varchar(100) NOT NULL,
	"message" text NOT NULL,
	"email" varchar(255),
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_brief_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"narrative" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_reward_caps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" varchar(100) NOT NULL,
	"bucket_date" date NOT NULL,
	"used_units" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_reward_caps_used_nonneg" CHECK ("daily_reward_caps"."used_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_id" uuid,
	"title" varchar(512) DEFAULT 'Untitled' NOT NULL,
	"content" jsonb,
	"content_text" text DEFAULT '',
	"icon" varchar(64),
	"cover_image" text,
	"cover_gradient" integer,
	"is_archived" boolean DEFAULT false NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"linked_task_id" uuid,
	"linked_event_id" uuid,
	"word_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_recurrence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rrule" text NOT NULL,
	"exdates" text[] DEFAULT '{}' NOT NULL,
	"recurrence_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"title" varchar(512) NOT NULL,
	"description" text,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"is_all_day" boolean DEFAULT false NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"category" varchar(64),
	"color" varchar(32),
	"completed" boolean DEFAULT false NOT NULL,
	"linked_task_id" uuid,
	"location" varchar(512),
	"provider" "event_provider" DEFAULT 'local' NOT NULL,
	"external_event_id" text,
	"external_etag" text,
	"source_updated_at" timestamp with time zone,
	"sync_status" "event_sync_status" DEFAULT 'local_only' NOT NULL,
	"meeting_url" text,
	"organizer_email" text,
	"is_task_generated" boolean DEFAULT false NOT NULL,
	"source" "event_source" DEFAULT 'manual' NOT NULL,
	"external_id" varchar(255),
	"last_synced_at" timestamp with time zone,
	"recurring_event_id" uuid,
	"original_start_time" timestamp with time zone,
	"is_recurrence_exception" boolean DEFAULT false NOT NULL,
	"created_via_nl" boolean DEFAULT false NOT NULL,
	"reminder_sent_at" timestamp with time zone,
	"linked_doc_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_time_range_check" CHECK ("events"."end_time" > "events"."start_time")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "focus_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid,
	"task_title" varchar(512),
	"goal_id" uuid,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"coins_earned" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "focus_sessions_duration_check" CHECK ("focus_sessions"."duration_minutes" > 0),
	CONSTRAINT "focus_sessions_time_range_check" CHECK ("focus_sessions"."end_time" > "focus_sessions"."start_time")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"emoji" varchar(10),
	"color" varchar(20),
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"timeframe" "goal_timeframe" NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "goal_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"type" "target_type" NOT NULL,
	"current_value" numeric(10, 2) DEFAULT '0' NOT NULL,
	"target_value" numeric(10, 2) NOT NULL,
	"unit" varchar(50),
	"linked_task_ids" text,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"avatar" text,
	"focus_session_length" integer DEFAULT 25 NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"daily_streak" integer DEFAULT 0 NOT NULL,
	"best_daily_streak" integer DEFAULT 0 NOT NULL,
	"session_streak" integer DEFAULT 0 NOT NULL,
	"best_session_streak" integer DEFAULT 0 NOT NULL,
	"last_focus_date" date,
	"last_session_at" timestamp with time zone,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"active_cosmetics" jsonb DEFAULT '{}'::jsonb,
	"owned_items" jsonb DEFAULT '[]'::jsonb,
	"consumables" jsonb DEFAULT '{"focusBoost":0,"streakShield":0,"taskMultiplier":0,"autoPlan":0,"goalAccelerator":0}'::jsonb,
	"notification_preferences" jsonb DEFAULT '{"dailyBrief":true,"eventReminders":true,"streakReminder":true,"taskReminders":true,"focusComplete":false}'::jsonb,
	"work_start" varchar(5) DEFAULT '09:00',
	"work_end" varchar(5) DEFAULT '17:00',
	"onboarding_completed_at" timestamp with time zone,
	"user_role" varchar(120),
	"custom_categories" jsonb DEFAULT '[]'::jsonb,
	"short_break_mins" integer DEFAULT 5 NOT NULL,
	"long_break_mins" integer DEFAULT 20 NOT NULL,
	"sessions_per_cycle" integer DEFAULT 4 NOT NULL,
	"ambient_track" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_coins_nonneg" CHECK ("users"."coins" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(512) NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"difficulty" "task_difficulty" DEFAULT 'medium' NOT NULL,
	"estimated_minutes" integer DEFAULT 30 NOT NULL,
	"due_date" timestamp with time zone,
	"scheduled_start" varchar(5),
	"scheduled_end" varchar(5),
	"remaining_focus_time" integer,
	"linked_event_id" uuid,
	"linked_doc_id" uuid,
	"goal_id" uuid,
	"parent_task_id" uuid,
	"depth" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_estimated_minutes_check" CHECK ("tasks"."estimated_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "planner_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"is_auto_scheduled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planner_items_time_range_check" CHECK ("planner_items"."end_time" > "planner_items"."start_time")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"token_type" text,
	"last_sync_at" timestamp with time zone,
	"status" "integration_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mood_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"focus_session_id" uuid,
	"mood" varchar(16) NOT NULL,
	"note" text,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"last_request" bigint NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '1 day' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" varchar(64) NOT NULL,
	"local_date" varchar(10) NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "calendars" ADD CONSTRAINT "calendars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "contact_submissions" ADD CONSTRAINT "contact_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "daily_brief_cache" ADD CONSTRAINT "daily_brief_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "daily_reward_caps" ADD CONSTRAINT "daily_reward_caps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "docs" ADD CONSTRAINT "docs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "docs" ADD CONSTRAINT "docs_linked_task_id_tasks_id_fk" FOREIGN KEY ("linked_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "docs" ADD CONSTRAINT "docs_linked_event_id_events_id_fk" FOREIGN KEY ("linked_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_recurrence" ADD CONSTRAINT "event_recurrence_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_recurrence" ADD CONSTRAINT "event_recurrence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "events" ADD CONSTRAINT "events_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "events" ADD CONSTRAINT "events_linked_task_id_tasks_id_fk" FOREIGN KEY ("linked_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goal_targets" ADD CONSTRAINT "goal_targets_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_tasks_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "planner_items" ADD CONSTRAINT "planner_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "planner_items" ADD CONSTRAINT "planner_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "integrations" ADD CONSTRAINT "integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mood_logs" ADD CONSTRAINT "mood_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mood_logs" ADD CONSTRAINT "mood_logs_focus_session_id_focus_sessions_id_fk" FOREIGN KEY ("focus_session_id") REFERENCES "public"."focus_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notification_sends" ADD CONSTRAINT "notification_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_provider_id_idx" ON "accounts" USING btree ("provider_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_provider_account_unique" ON "accounts" USING btree ("provider_id","account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "achievements_user_id_idx" ON "achievements" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "achievements_user_type_uniq" ON "achievements" USING btree ("user_id","type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendars_user_id_idx" ON "calendars" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendars_provider_idx" ON "calendars" USING btree ("provider");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendars_one_primary_local_per_user" ON "calendars" USING btree ("user_id") WHERE "calendars"."provider" = 'local' and "calendars"."is_primary" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_tx_user_created_idx" ON "coin_transactions" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coin_tx_user_dedupe_uniq" ON "coin_transactions" USING btree ("user_id","dedupe_key") WHERE "coin_transactions"."dedupe_key" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_brief_cache_user_date_unique" ON "daily_brief_cache" USING btree ("user_id","date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_brief_cache_user_id_idx" ON "daily_brief_cache" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_reward_caps_user_reason_date_uniq" ON "daily_reward_caps" USING btree ("user_id","reason","bucket_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "docs_user_id_idx" ON "docs" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "docs_parent_id_idx" ON "docs" USING btree ("parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "docs_user_parent_idx" ON "docs" USING btree ("user_id","parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "docs_linked_task_id_idx" ON "docs" USING btree ("linked_task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "docs_linked_event_id_idx" ON "docs" USING btree ("linked_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "docs_content_fts_idx" ON "docs" USING gin (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("content_text", '')));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_recurrence_event_id_idx" ON "event_recurrence" USING btree ("event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_recurrence_user_id_idx" ON "event_recurrence" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_user_start_time_idx" ON "events" USING btree ("user_id","start_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_user_end_time_idx" ON "events" USING btree ("user_id","end_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_calendar_id_idx" ON "events" USING btree ("calendar_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_calendar_start_time_idx" ON "events" USING btree ("calendar_id","start_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_external_id_idx" ON "events" USING btree ("external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_recurring_event_id_idx" ON "events" USING btree ("recurring_event_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "events_calendar_external_event_unique" ON "events" USING btree ("calendar_id","external_event_id") WHERE "events"."external_event_id" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "focus_sessions_user_id_idx" ON "focus_sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "focus_sessions_goal_id_idx" ON "focus_sessions" USING btree ("goal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_user_id_idx" ON "goals" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_status_idx" ON "goals" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goal_targets_goal_id_idx" ON "goal_targets" USING btree ("goal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_unique" ON "sessions" USING btree ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verifications_identifier_idx" ON "verifications" USING btree ("identifier");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_user_id_idx" ON "tasks" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_status_idx" ON "tasks" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_user_status_position_idx" ON "tasks" USING btree ("user_id","status","position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_user_due_idx" ON "tasks" USING btree ("user_id","due_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_linked_event_id_idx" ON "tasks" USING btree ("linked_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_parent_task_id_idx" ON "tasks" USING btree ("parent_task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_goal_id_idx" ON "tasks" USING btree ("goal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planner_items_user_start_time_idx" ON "planner_items" USING btree ("user_id","start_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrations_user_provider_idx" ON "integrations" USING btree ("user_id","provider");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integrations_user_provider_unique" ON "integrations" USING btree ("user_id","provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mood_logs_user_id_idx" ON "mood_logs" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_push_subscriptions_user_id" ON "push_subscriptions" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_push_subscriptions_user_endpoint" ON "push_subscriptions" USING btree ("user_id","endpoint");
--> statement-breakpoint
-- Deduplicate before the unique index, the way 0024 does for the link indexes.
-- If `rate_limits` was created by a `drizzle-kit push` that skipped this index
-- — exactly the drift this file exists to repair — duplicate keys would make
-- the CREATE fail, and without the index every `ON CONFLICT ("key")` in the
-- auth rate limiter raises 42P10 on every request. The rows are ephemeral
-- counters, so keeping the highest count per key loses nothing that matters.
DELETE FROM "rate_limits" a
  USING "rate_limits" b
 WHERE a."key" = b."key"
   AND (a."count", a."id") < (b."count", b."id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rate_limits_key_uniq" ON "rate_limits" USING btree ("key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limits_expires_at_idx" ON "rate_limits" USING btree ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_sends_user_kind_date_uniq" ON "notification_sends" USING btree ("user_id","kind","local_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_sends_sent_at_idx" ON "notification_sends" USING btree ("sent_at");


-- ==========================================================================
-- 0021_onboarding_record
-- ==========================================================================

-- ============================================================================
-- 0021_onboarding_record
--
-- F8.1 — onboarding completion was localStorage-only.
--
-- `grep -rn "onboard" src/db/ src/app/api/` returned NOTHING: `complete()` was
-- `set({ completed: true })` and the only durable trace was
-- `localStorage['lumina-onboarding']`.
--
-- Consequences, all of them real:
--   * A returning user on a new device, a cleared browser, a private window or
--     a different browser got `completed: false` and was force-marched through
--     the entire flow again — overwriting the workStart / workEnd / timezone
--     already stored against their account on the way through.
--   * A guest who completed onboarding and then signed in already had
--     `completed: true`, so the new real account never got an onboarding pass
--     and inherited the GUEST's name, role and work hours.
--   * Two accounts on one browser produced a visible
--     /onboarding -> /calendar -> reload -> /onboarding bounce, with account
--     A's userName briefly rendered inside account B's flow.
--
-- `onboarding_completed_at` is now the record; localStorage is a cache.
-- `user_role` moves alongside it — it was collected during onboarding and
-- likewise never persisted server-side.
--
-- Additive and idempotent: `ADD COLUMN IF NOT EXISTS` on nullable columns takes
-- no table rewrite and no long lock, so this is safe to run against production
-- while it serves traffic.
--
-- NOTE ON EXISTING USERS: this deliberately does NOT backfill
-- `onboarding_completed_at` for accounts that already exist. We cannot know
-- from the database whether they finished the flow, and guessing "yes" would
-- skip onboarding for someone who genuinely never did it. Their browser's
-- localStorage still carries the flag, and `complete()` now writes the column
-- the first time they pass through — so existing users converge on their next
-- visit without anyone being wrongly skipped.
-- ============================================================================

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "user_role" varchar(120);


-- ==========================================================================
-- 0022_task_position
-- ==========================================================================

-- ============================================================================
-- 0022_task_position
--
-- Manual board order for tasks was never persisted.
--
-- `GET /api/tasks` synthesised the field on every read:
--
--     .orderBy(tasks.createdAt);
--     ...
--     order: index,
--
-- there was no `order`/`position` column on `tasks`, and `PATCH /api/tasks/[id]`
-- ignored the field entirely. So the drag-reorder fan-out
--
--     updated.forEach(t => tasksPersistence.updateOne(t.id, { order: t.order }));
--
-- issued N HTTP requests that each wrote nothing, and the board snapped back to
-- created-at order on the next reload. (The audit reported this as P1-17 —
-- "order permanently divergent from the database" — which understates it: the
-- order never reached the database at all.)
--
-- Also adds the two composite indexes P2-7 asked for. `tasks` had only
-- single-column `(user_id)` and `(status)`, matching no real query shape; the
-- hot reads are the board (user + status + position) and the due-date list.
--
-- Additive and idempotent. `ADD COLUMN ... DEFAULT 0 NOT NULL` on a nullable-free
-- default is a metadata-only change on Postgres 11+, so no table rewrite.
-- ============================================================================

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- Seed each user's existing tasks with their current created-at order, per
-- status column — so the first render after this migration matches what the
-- user was looking at before it, rather than collapsing every task to 0.
--
-- The guard is "no task anywhere has a non-zero position", NOT "this task is at
-- position 0". The latter looks like a one-shot guard and is not: position 0 is
-- the NORMAL state of the top card in every column, and the default for every
-- task created after this migration. Re-running with that guard rewrites every
-- top card to its created-at rank — silently destroying manual ordering and
-- creating duplicate positions. Reproduced: a board ordered C,A,B came back
-- C=2, A=1, B=2.
--
-- This condition is true exactly once, immediately after the column is added
-- with DEFAULT 0, so the seeding runs once and every later run is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "tasks" WHERE "position" <> 0) THEN
    UPDATE "tasks" t
    SET "position" = seeded.rn
    FROM (
      SELECT
        id,
        (row_number() OVER (PARTITION BY user_id, status ORDER BY created_at) - 1) AS rn
      FROM "tasks"
    ) AS seeded
    WHERE t.id = seeded.id;
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tasks_user_status_position_idx"
  ON "tasks" ("user_id", "status", "position");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tasks_user_due_idx"
  ON "tasks" ("user_id", "due_date");


-- ==========================================================================
-- 0023_notification_sends
-- ==========================================================================

-- ============================================================================
-- 0023_notification_sends
--
-- P1-2 — two of the three crons were not idempotent, and the third scanned the
-- whole events table to find its work.
--
-- ## notification_sends
--
-- Neither `daily-brief` nor `streak-reminder` recorded that a notification had
-- been sent, so a Vercel retry — or a re-run after a partial timeout — re-sent
-- to everyone. `tag: 'daily-brief'` only collapses the *display* on-device; the
-- push is still sent and still costs quota.
--
-- `event-reminders` already did this correctly, with an atomic `reminder_sent_at`
-- claim and a regression test. The difference was that an event reminder has a
-- row to claim on and a daily brief does not. This table is that row.
--
-- The unique index is what makes the claim atomic:
--   INSERT ... ON CONFLICT DO NOTHING RETURNING id
-- returns a row to exactly one caller, however many run concurrently.
--
-- `local_date` is the USER'S local calendar date, not UTC. With the crons now
-- running hourly and firing at each user's configured local hour, a UTC bucket
-- would let someone in UTC+13 receive two briefs on one of their days.
--
-- ## events_reminder_due_idx
--
-- The reminder claim has no `user_id` predicate, and every `events` index is
-- `(user_id, …)`-leading — so it was a full sequential scan of the entire
-- events table, taking row locks as it went. This partial index matches the
-- claim exactly.
--
-- Additive and idempotent throughout.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "notification_sends" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "kind" varchar(64) NOT NULL,
  "local_date" varchar(10) NOT NULL,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "notification_sends"
    ADD CONSTRAINT "notification_sends_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "notification_sends_user_kind_date_uniq"
  ON "notification_sends" ("user_id", "kind", "local_date");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "notification_sends_sent_at_idx"
  ON "notification_sends" ("sent_at");--> statement-breakpoint

-- Partial index matching the reminder claim's predicate exactly.
CREATE INDEX IF NOT EXISTS "events_reminder_due_idx"
  ON "events" ("start_time")
  WHERE "reminder_sent_at" IS NULL AND "is_all_day" = false;


-- ==========================================================================
-- 0024_link_uniqueness
-- ==========================================================================

-- ============================================================================
-- 0024_link_uniqueness
--
-- P2-5 — task↔event linking had no uniqueness behind it.
--
-- `POST /api/link` and `POST /api/events/create-linked` both read "is this task
-- already linked?" OUTSIDE the transaction and then wrote. Two concurrent
-- `create-linked` calls therefore each created an event and each set
-- `tasks.linked_event_id`; the loser's event was permanently orphaned — invisible
-- to the task it belonged to, and with no UI path to find or delete it.
--
-- The routes now re-assert the condition in the UPDATE's WHERE and roll back on
-- zero rows. These indexes are the backstop under that: even a future call site
-- that forgets the guard cannot produce a second claim on the same row.
--
-- Both are PARTIAL — unlinked is the normal state and NULLs must stay
-- unconstrained (Postgres would allow unlimited NULLs in a plain unique index
-- anyway, but the partial form also keeps the index small).
--
-- ## The repair below
--
-- A unique index cannot be created over data that already violates it. If any
-- duplicate links exist in production this migration would fail and block the
-- deploy, so it repairs first, in the same transaction, in two deterministic
-- passes:
--
--   Pass 1 — drop the claims the counterpart does NOT point back at. The link is
--            bidirectional; if `events.linked_task_id` names one specific task,
--            every other task claiming that event is a stale half-write and
--            clearing it loses nothing.
--   Pass 2 — for anything still duplicated (both sides inconsistent), keep the
--            OLDEST row by `created_at` and clear the rest. Arbitrary, but
--            deterministic and re-runnable.
--
-- Neither pass deletes a task or an event. It only clears link pointers that
-- were already unreachable. `scripts/check-duplicate-links.sql` reports what
-- WOULD be cleared, without changing anything — run it first if you want the
-- list.
-- ============================================================================

-- ── tasks.linked_event_id ───────────────────────────────────────────────────

UPDATE tasks t
   SET linked_event_id = NULL,
       updated_at = now()
 WHERE t.linked_event_id IS NOT NULL
   AND EXISTS (
         SELECT 1 FROM tasks o
          WHERE o.linked_event_id = t.linked_event_id
            AND o.id <> t.id
       )
   AND NOT EXISTS (
         SELECT 1 FROM events e
          WHERE e.id = t.linked_event_id
            AND e.linked_task_id = t.id
       );
--> statement-breakpoint

UPDATE tasks t
   SET linked_event_id = NULL,
       updated_at = now()
 WHERE t.linked_event_id IS NOT NULL
   AND t.id <> (
         SELECT o.id
           FROM tasks o
          WHERE o.linked_event_id = t.linked_event_id
          ORDER BY o.created_at ASC, o.id ASC
          LIMIT 1
       );
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS tasks_linked_event_uniq
  ON tasks (linked_event_id)
  WHERE linked_event_id IS NOT NULL;
--> statement-breakpoint

-- ── events.linked_task_id ───────────────────────────────────────────────────

UPDATE events e
   SET linked_task_id = NULL,
       updated_at = now()
 WHERE e.linked_task_id IS NOT NULL
   AND EXISTS (
         SELECT 1 FROM events o
          WHERE o.linked_task_id = e.linked_task_id
            AND o.id <> e.id
       )
   AND NOT EXISTS (
         SELECT 1 FROM tasks t
          WHERE t.id = e.linked_task_id
            AND t.linked_event_id = e.id
       );
--> statement-breakpoint

UPDATE events e
   SET linked_task_id = NULL,
       updated_at = now()
 WHERE e.linked_task_id IS NOT NULL
   AND e.id <> (
         SELECT o.id
           FROM events o
          WHERE o.linked_task_id = e.linked_task_id
          ORDER BY o.created_at ASC, o.id ASC
          LIMIT 1
       );
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS events_linked_task_uniq
  ON events (linked_task_id)
  WHERE linked_task_id IS NOT NULL;


-- ==========================================================================
-- 0025_session_expiry_index
-- ==========================================================================

-- ============================================================================
-- 0025_session_expiry_index
--
-- F5.9 — expired session rows were never deleted, and the sweep that now does
-- it had no index to work with.
--
-- BetterAuth's only cleanup is lazy: `get-session` deletes the row when the
-- SAME client presents an expired token. A user who signs up and never
-- returns, or who clears cookies, leaves the row forever.
--
-- The hourly cron now deletes by expiry. Without this index that is a seq scan
-- over one of the busiest tables in the schema, inside a serverless function
-- with a timeout — while `rate_limits`, whose sweep sits directly beside it in
-- the same handler, has had the equivalent index since the baseline.
-- ============================================================================

CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");


-- ==========================================================================
-- column-heal â€” generated by scripts/generate-column-heal.ts, do not hand-edit
--
-- One idempotent ADD COLUMN per column in the Drizzle schema. The migrations
-- above create tables with CREATE TABLE IF NOT EXISTS, which heals a missing
-- TABLE but silently skips a table that exists with missing COLUMNS â€” the exact
-- shape of the sign-in outage (`users` existed; `onboarding_completed_at` did
-- not). This pass closes that gap for every table, not just the two columns
-- migration 0021 happened to name.
-- ==========================================================================

-- accounts
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "account_id" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "provider_id" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "access_token" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "refresh_token" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "id_token" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "access_token_expires_at" timestamp with time zone;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "refresh_token_expires_at" timestamp with time zone;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "scope" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "password" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- achievements
ALTER TABLE "achievements" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "achievements" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "achievements" ADD COLUMN IF NOT EXISTS "type" varchar(64);
ALTER TABLE "achievements" ADD COLUMN IF NOT EXISTS "unlocked_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "achievements" ADD COLUMN IF NOT EXISTS "seen" boolean DEFAULT false NOT NULL;

-- calendars
ALTER TABLE "calendars" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "calendars" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "calendars" ADD COLUMN IF NOT EXISTS "provider" calendar_provider;
ALTER TABLE "calendars" ADD COLUMN IF NOT EXISTS "external_id" varchar(255);
ALTER TABLE "calendars" ADD COLUMN IF NOT EXISTS "name" varchar(255);
ALTER TABLE "calendars" ADD COLUMN IF NOT EXISTS "color" varchar(32) DEFAULT '#6D59E0' NOT NULL;
ALTER TABLE "calendars" ADD COLUMN IF NOT EXISTS "enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "calendars" ADD COLUMN IF NOT EXISTS "is_primary" boolean DEFAULT false NOT NULL;
ALTER TABLE "calendars" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "calendars" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- coin_transactions
ALTER TABLE "coin_transactions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "coin_transactions" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "coin_transactions" ADD COLUMN IF NOT EXISTS "amount" integer;
ALTER TABLE "coin_transactions" ADD COLUMN IF NOT EXISTS "reason" varchar(100);
ALTER TABLE "coin_transactions" ADD COLUMN IF NOT EXISTS "label" varchar(255);
ALTER TABLE "coin_transactions" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}';
ALTER TABLE "coin_transactions" ADD COLUMN IF NOT EXISTS "dedupe_key" varchar(200);
ALTER TABLE "coin_transactions" ADD COLUMN IF NOT EXISTS "source_type" varchar(100);
ALTER TABLE "coin_transactions" ADD COLUMN IF NOT EXISTS "source_id" varchar(255);
ALTER TABLE "coin_transactions" ADD COLUMN IF NOT EXISTS "balance_after" integer;
ALTER TABLE "coin_transactions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

-- contact_submissions
ALTER TABLE "contact_submissions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "contact_submissions" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "contact_submissions" ADD COLUMN IF NOT EXISTS "type" varchar(32);
ALTER TABLE "contact_submissions" ADD COLUMN IF NOT EXISTS "subject" varchar(100);
ALTER TABLE "contact_submissions" ADD COLUMN IF NOT EXISTS "message" text;
ALTER TABLE "contact_submissions" ADD COLUMN IF NOT EXISTS "email" varchar(255);
ALTER TABLE "contact_submissions" ADD COLUMN IF NOT EXISTS "submitted_at" timestamp with time zone DEFAULT now() NOT NULL;

-- daily_brief_cache
ALTER TABLE "daily_brief_cache" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "daily_brief_cache" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "daily_brief_cache" ADD COLUMN IF NOT EXISTS "date" date;
ALTER TABLE "daily_brief_cache" ADD COLUMN IF NOT EXISTS "narrative" text;
ALTER TABLE "daily_brief_cache" ADD COLUMN IF NOT EXISTS "generated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- daily_reward_caps
ALTER TABLE "daily_reward_caps" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "daily_reward_caps" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "daily_reward_caps" ADD COLUMN IF NOT EXISTS "reason" varchar(100);
ALTER TABLE "daily_reward_caps" ADD COLUMN IF NOT EXISTS "bucket_date" date;
ALTER TABLE "daily_reward_caps" ADD COLUMN IF NOT EXISTS "used_units" integer DEFAULT 0 NOT NULL;
ALTER TABLE "daily_reward_caps" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- docs
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "parent_id" uuid;
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "title" varchar(512) DEFAULT 'Untitled' NOT NULL;
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "content" jsonb;
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "content_text" text DEFAULT '';
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "icon" varchar(64);
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "cover_image" text;
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "cover_gradient" integer;
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "is_archived" boolean DEFAULT false NOT NULL;
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "is_pinned" boolean DEFAULT false NOT NULL;
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "position" integer DEFAULT 0 NOT NULL;
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "linked_task_id" uuid;
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "linked_event_id" uuid;
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "word_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- event_recurrence
ALTER TABLE "event_recurrence" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "event_recurrence" ADD COLUMN IF NOT EXISTS "event_id" uuid;
ALTER TABLE "event_recurrence" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "event_recurrence" ADD COLUMN IF NOT EXISTS "rrule" text;
ALTER TABLE "event_recurrence" ADD COLUMN IF NOT EXISTS "exdates" text[] DEFAULT '[]' NOT NULL;
ALTER TABLE "event_recurrence" ADD COLUMN IF NOT EXISTS "recurrence_end" timestamp with time zone;
ALTER TABLE "event_recurrence" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "event_recurrence" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- events
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "calendar_id" uuid;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "title" varchar(512);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "start_time" timestamp with time zone;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "end_time" timestamp with time zone;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "is_all_day" boolean DEFAULT false NOT NULL;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'UTC' NOT NULL;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "category" varchar(64);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "color" varchar(32);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "completed" boolean DEFAULT false NOT NULL;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "linked_task_id" uuid;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "location" varchar(512);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "provider" event_provider DEFAULT 'local' NOT NULL;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "external_event_id" text;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "external_etag" text;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "source_updated_at" timestamp with time zone;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "sync_status" event_sync_status DEFAULT 'local_only' NOT NULL;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "meeting_url" text;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "organizer_email" text;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "is_task_generated" boolean DEFAULT false NOT NULL;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "source" event_source DEFAULT 'manual' NOT NULL;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "external_id" varchar(255);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp with time zone;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "recurring_event_id" uuid;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "original_start_time" timestamp with time zone;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "is_recurrence_exception" boolean DEFAULT false NOT NULL;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "created_via_nl" boolean DEFAULT false NOT NULL;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "reminder_sent_at" timestamp with time zone;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "linked_doc_id" uuid;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- focus_sessions
ALTER TABLE "focus_sessions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "focus_sessions" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "focus_sessions" ADD COLUMN IF NOT EXISTS "task_id" uuid;
ALTER TABLE "focus_sessions" ADD COLUMN IF NOT EXISTS "task_title" varchar(512);
ALTER TABLE "focus_sessions" ADD COLUMN IF NOT EXISTS "goal_id" uuid;
ALTER TABLE "focus_sessions" ADD COLUMN IF NOT EXISTS "start_time" timestamp with time zone;
ALTER TABLE "focus_sessions" ADD COLUMN IF NOT EXISTS "end_time" timestamp with time zone;
ALTER TABLE "focus_sessions" ADD COLUMN IF NOT EXISTS "duration_minutes" integer;
ALTER TABLE "focus_sessions" ADD COLUMN IF NOT EXISTS "coins_earned" integer DEFAULT 0 NOT NULL;
ALTER TABLE "focus_sessions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

-- goal_targets
ALTER TABLE "goal_targets" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "goal_targets" ADD COLUMN IF NOT EXISTS "goal_id" uuid;
ALTER TABLE "goal_targets" ADD COLUMN IF NOT EXISTS "title" varchar(255);
ALTER TABLE "goal_targets" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "goal_targets" ADD COLUMN IF NOT EXISTS "type" target_type;
ALTER TABLE "goal_targets" ADD COLUMN IF NOT EXISTS "current_value" numeric(10, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "goal_targets" ADD COLUMN IF NOT EXISTS "target_value" numeric(10, 2);
ALTER TABLE "goal_targets" ADD COLUMN IF NOT EXISTS "unit" varchar(50);
ALTER TABLE "goal_targets" ADD COLUMN IF NOT EXISTS "linked_task_ids" text;
ALTER TABLE "goal_targets" ADD COLUMN IF NOT EXISTS "order" integer DEFAULT 0 NOT NULL;
ALTER TABLE "goal_targets" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "goal_targets" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- goals
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "title" varchar(255);
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "emoji" varchar(10);
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "color" varchar(20);
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "status" goal_status DEFAULT 'active' NOT NULL;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "timeframe" goal_timeframe;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "start_date" timestamp with time zone;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "end_date" timestamp with time zone;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- integrations
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "provider" integration_provider;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "access_token" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "refresh_token" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "scope" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "token_type" text;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "last_sync_at" timestamp with time zone;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "status" integration_status DEFAULT 'active' NOT NULL;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- mood_logs
ALTER TABLE "mood_logs" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "mood_logs" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "mood_logs" ADD COLUMN IF NOT EXISTS "focus_session_id" uuid;
ALTER TABLE "mood_logs" ADD COLUMN IF NOT EXISTS "mood" varchar(16);
ALTER TABLE "mood_logs" ADD COLUMN IF NOT EXISTS "note" text;
ALTER TABLE "mood_logs" ADD COLUMN IF NOT EXISTS "logged_at" timestamp with time zone DEFAULT now() NOT NULL;

-- notification_sends
ALTER TABLE "notification_sends" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "notification_sends" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "notification_sends" ADD COLUMN IF NOT EXISTS "kind" varchar(64);
ALTER TABLE "notification_sends" ADD COLUMN IF NOT EXISTS "local_date" varchar(10);
ALTER TABLE "notification_sends" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone DEFAULT now() NOT NULL;

-- planner_items
ALTER TABLE "planner_items" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "planner_items" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "planner_items" ADD COLUMN IF NOT EXISTS "task_id" uuid;
ALTER TABLE "planner_items" ADD COLUMN IF NOT EXISTS "start_time" timestamp with time zone;
ALTER TABLE "planner_items" ADD COLUMN IF NOT EXISTS "end_time" timestamp with time zone;
ALTER TABLE "planner_items" ADD COLUMN IF NOT EXISTS "is_auto_scheduled" boolean DEFAULT false NOT NULL;
ALTER TABLE "planner_items" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "planner_items" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- push_subscriptions
ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "endpoint" text;
ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "p256dh" text;
ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "auth" text;
ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "user_agent" text;
ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone DEFAULT now() NOT NULL;

-- rate_limits
ALTER TABLE "rate_limits" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "rate_limits" ADD COLUMN IF NOT EXISTS "key" text;
ALTER TABLE "rate_limits" ADD COLUMN IF NOT EXISTS "count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "rate_limits" ADD COLUMN IF NOT EXISTS "last_request" bigint;
ALTER TABLE "rate_limits" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone DEFAULT now() + interval '1 day' NOT NULL;

-- sessions
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "token" text;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "ip_address" text;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "user_agent" text;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "user_id" uuid;

-- tasks
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "title" varchar(512);
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "status" task_status DEFAULT 'todo' NOT NULL;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "priority" task_priority DEFAULT 'medium' NOT NULL;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "difficulty" task_difficulty DEFAULT 'medium' NOT NULL;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "estimated_minutes" integer DEFAULT 30 NOT NULL;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "due_date" timestamp with time zone;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "scheduled_start" varchar(5);
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "scheduled_end" varchar(5);
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "remaining_focus_time" integer;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "linked_event_id" uuid;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "linked_doc_id" uuid;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "goal_id" uuid;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "parent_task_id" uuid;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "depth" integer DEFAULT 0 NOT NULL;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "position" integer DEFAULT 0 NOT NULL;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" varchar(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "image" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "focus_session_length" integer DEFAULT 25 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "coins" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "daily_streak" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "best_daily_streak" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "session_streak" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "best_session_streak" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_focus_date" date;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_session_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'UTC' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "active_cosmetics" jsonb DEFAULT '{}';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "owned_items" jsonb DEFAULT '[]';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "consumables" jsonb DEFAULT '{"focusBoost":0,"streakShield":0,"taskMultiplier":0,"autoPlan":0,"goalAccelerator":0}';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notification_preferences" jsonb DEFAULT '{"dailyBrief":true,"eventReminders":true,"streakReminder":true,"taskReminders":true,"focusComplete":false}';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "work_start" varchar(5) DEFAULT '09:00';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "work_end" varchar(5) DEFAULT '17:00';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "user_role" varchar(120);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "custom_categories" jsonb DEFAULT '[]';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "short_break_mins" integer DEFAULT 5 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "long_break_mins" integer DEFAULT 20 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sessions_per_cycle" integer DEFAULT 4 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ambient_track" varchar(32);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- verifications
ALTER TABLE "verifications" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE "verifications" ADD COLUMN IF NOT EXISTS "identifier" text;
ALTER TABLE "verifications" ADD COLUMN IF NOT EXISTS "value" text;
ALTER TABLE "verifications" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
ALTER TABLE "verifications" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "verifications" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- --------------------------------------------------------------------------
-- Emitted NULLABLE despite being NOT NULL in the schema, because they have no
-- default and Postgres cannot add a NOT NULL column to a table with rows:
--   accounts.account_id
--   accounts.provider_id
--   accounts.user_id
--   achievements.user_id
--   achievements.type
--   calendars.user_id
--   calendars.provider
--   calendars.name
--   coin_transactions.user_id
--   coin_transactions.amount
--   coin_transactions.reason
--   coin_transactions.label
--   contact_submissions.type
--   contact_submissions.subject
--   contact_submissions.message
--   daily_brief_cache.user_id
--   daily_brief_cache.date
--   daily_brief_cache.narrative
--   daily_reward_caps.user_id
--   daily_reward_caps.reason
--   daily_reward_caps.bucket_date
--   docs.user_id
--   event_recurrence.event_id
--   event_recurrence.user_id
--   event_recurrence.rrule
--   events.user_id
--   events.calendar_id
--   events.title
--   events.start_time
--   events.end_time
--   focus_sessions.user_id
--   focus_sessions.start_time
--   focus_sessions.end_time
--   focus_sessions.duration_minutes
--   goal_targets.goal_id
--   goal_targets.title
--   goal_targets.type
--   goal_targets.target_value
--   goals.user_id
--   goals.title
--   goals.timeframe
--   goals.start_date
--   goals.end_date
--   integrations.user_id
--   integrations.provider
--   integrations.access_token
--   integrations.refresh_token
--   integrations.expires_at
--   mood_logs.user_id
--   mood_logs.mood
--   notification_sends.user_id
--   notification_sends.kind
--   notification_sends.local_date
--   planner_items.user_id
--   planner_items.task_id
--   planner_items.start_time
--   planner_items.end_time
--   push_subscriptions.user_id
--   push_subscriptions.endpoint
--   push_subscriptions.p256dh
--   push_subscriptions.auth
--   rate_limits.key
--   rate_limits.last_request
--   sessions.expires_at
--   sessions.token
--   sessions.user_id
--   tasks.user_id
--   tasks.title
--   users.email
--   verifications.identifier
--   verifications.value
--   verifications.expires_at
-- If any of these is genuinely missing in your database, backfill it and add
-- the constraint deliberately. A failed migration is worse than a nullable
-- column, which is why the script does not attempt it.
-- --------------------------------------------------------------------------

-- ── 0026 · events.tz_backfilled_at ────────────────────────────────────────
-- Added after this script was first written, so it is appended rather than
-- woven in. `scripts/backfill-event-timezones.sql` creates this column itself
-- with ADD COLUMN IF NOT EXISTS and filters every step on it being NULL —
-- that filter is the only thing making the backfill safe to run twice. It is
-- declared in the Drizzle schema and in drizzle/0026 so the two agree.
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "tz_backfilled_at" timestamptz;

COMMIT;
