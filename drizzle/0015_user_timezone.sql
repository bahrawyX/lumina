-- Add timezone column to users table for cron job local-time calculations
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" text NOT NULL DEFAULT 'UTC';
