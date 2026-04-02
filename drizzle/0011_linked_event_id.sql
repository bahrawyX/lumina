-- Add linked_event_id column to tasks table for bidirectional task ↔ event linking
-- FK references events(id) with ON DELETE SET NULL so deleting an event auto-clears the link

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'linked_event_id'
  ) THEN
    ALTER TABLE "tasks" ADD COLUMN "linked_event_id" uuid;
  END IF;
END $$;

-- Add foreign key constraint (idempotent: skip if already exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tasks_linked_event_id_events_id_fk'
      AND table_name = 'tasks'
  ) THEN
    ALTER TABLE "tasks"
      ADD CONSTRAINT "tasks_linked_event_id_events_id_fk"
      FOREIGN KEY ("linked_event_id") REFERENCES "events"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- Index for reverse lookups (find task by linked event)
CREATE INDEX IF NOT EXISTS "tasks_linked_event_id_idx" ON "tasks" ("linked_event_id");
