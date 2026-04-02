-- 0008: Add task_title to focus_sessions (denormalized for history resilience)
-- Idempotent: safe to re-run if column already exists.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'focus_sessions' AND column_name = 'task_title'
  ) THEN
    ALTER TABLE "focus_sessions" ADD COLUMN "task_title" varchar(512);
  END IF;
END $$;
