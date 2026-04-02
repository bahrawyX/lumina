-- Step 1: Add recurrence columns to events table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'recurring_event_id') THEN
    ALTER TABLE "events" ADD COLUMN "recurring_event_id" uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'original_start_time') THEN
    ALTER TABLE "events" ADD COLUMN "original_start_time" timestamp with time zone;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'is_recurrence_exception') THEN
    ALTER TABLE "events" ADD COLUMN "is_recurrence_exception" boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Step 2: Create event_recurrence table
CREATE TABLE IF NOT EXISTS "event_recurrence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "rrule" text NOT NULL,
  "exdates" text[] NOT NULL DEFAULT '{}',
  "recurrence_end" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Step 3: Create indexes
CREATE INDEX IF NOT EXISTS "event_recurrence_event_id_idx" ON "event_recurrence" USING btree ("event_id");
CREATE INDEX IF NOT EXISTS "event_recurrence_user_id_idx" ON "event_recurrence" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "events_recurring_event_id_idx" ON "events" USING btree ("recurring_event_id");
