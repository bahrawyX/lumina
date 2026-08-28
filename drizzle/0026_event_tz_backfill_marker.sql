-- P0-6 / P0-1: `scripts/backfill-event-timezones.sql` creates this column with
-- `ADD COLUMN IF NOT EXISTS` and every one of its steps filters on
-- `tz_backfilled_at IS NULL` — that filter is the only thing making the script
-- safe to run twice.
--
-- It existed in no migration and in no Drizzle schema. Running the backfill in
-- production and then `drizzle-kit generate` would have produced a
-- `DROP COLUMN` for it, silently removing the idempotency guard and letting a
-- second run shift every event's start time by the user's UTC offset again.
--
-- Declaring it here makes the script and the schema agree in both directions.

ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "tz_backfilled_at" timestamptz;
