-- Streak, coin, and gamification columns on users
ALTER TABLE "users" ADD COLUMN "coins" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN "daily_streak" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN "best_daily_streak" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN "session_streak" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN "best_session_streak" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN "last_focus_date" date;
ALTER TABLE "users" ADD COLUMN "last_session_at" timestamp with time zone;

-- Coins earned per focus session
ALTER TABLE "focus_sessions" ADD COLUMN "coins_earned" integer DEFAULT 0 NOT NULL;

-- Achievements table
CREATE TABLE IF NOT EXISTS "achievements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" varchar(64) NOT NULL,
  "unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "seen" boolean DEFAULT false NOT NULL
);
CREATE INDEX IF NOT EXISTS "achievements_user_id_idx" ON "achievements" ("user_id");

-- Mood logs table
CREATE TABLE IF NOT EXISTS "mood_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "focus_session_id" uuid REFERENCES "focus_sessions"("id") ON DELETE SET NULL,
  "mood" varchar(16) NOT NULL,
  "note" text,
  "logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "mood_logs_user_id_idx" ON "mood_logs" ("user_id");

-- Contact submissions table
CREATE TABLE IF NOT EXISTS "contact_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "type" varchar(32) NOT NULL,
  "subject" varchar(100) NOT NULL,
  "message" text NOT NULL,
  "email" varchar(255),
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
