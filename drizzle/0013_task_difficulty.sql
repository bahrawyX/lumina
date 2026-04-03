-- Add difficulty column to tasks table
-- Values: 'easy' | 'medium' | 'hard', default 'medium'

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'task_difficulty'
  ) THEN
    CREATE TYPE "task_difficulty" AS ENUM ('easy', 'medium', 'hard');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'difficulty'
  ) THEN
    ALTER TABLE "tasks" ADD COLUMN "difficulty" "task_difficulty" NOT NULL DEFAULT 'medium';
  END IF;
END $$;
