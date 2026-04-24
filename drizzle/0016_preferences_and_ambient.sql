-- Work hours preferences
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "work_start" varchar(5) DEFAULT '09:00';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "work_end" varchar(5) DEFAULT '17:00';

-- Pomodoro break / cycle settings
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "short_break_mins" integer NOT NULL DEFAULT 5;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "long_break_mins" integer NOT NULL DEFAULT 20;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sessions_per_cycle" integer NOT NULL DEFAULT 4;

-- Ambient sound preference (null = none selected)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ambient_track" varchar(32);
