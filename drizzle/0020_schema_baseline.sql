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
CREATE UNIQUE INDEX IF NOT EXISTS "rate_limits_key_uniq" ON "rate_limits" USING btree ("key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limits_expires_at_idx" ON "rate_limits" USING btree ("expires_at");
