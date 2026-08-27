-- ============================================================================
-- 0025_session_expiry_index
--
-- F5.9 — expired session rows were never deleted, and the sweep that now does
-- it had no index to work with.
--
-- BetterAuth's only cleanup is lazy: `get-session` deletes the row when the
-- SAME client presents an expired token. A user who signs up and never
-- returns, or who clears cookies, leaves the row forever.
--
-- The hourly cron now deletes by expiry. Without this index that is a seq scan
-- over one of the busiest tables in the schema, inside a serverless function
-- with a timeout — while `rate_limits`, whose sweep sits directly beside it in
-- the same handler, has had the equivalent index since the baseline.
-- ============================================================================

CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");
