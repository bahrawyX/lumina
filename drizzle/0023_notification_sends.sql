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
