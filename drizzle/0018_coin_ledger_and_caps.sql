-- 0018_coin_ledger_and_caps
-- Batch 2 — coin-economy integrity (audit C2 / H1–H4 / M1).
-- Hand-authored to match the 0009–0017 convention (the drizzle-kit journal is
-- frozen at 0008; these migrations are maintained by hand). Forward-only,
-- idempotent, non-destructive.
--
-- Turns coin_transactions into an idempotent ledger, adds the generalized
-- per-day reward-cap table, and adds the non-negative balance invariant.

-- ── 1. Ledger columns on coin_transactions ──────────────────────────────────
-- `reason` stays the authoritative query discriminator. dedupe_key gives every
-- future award a unique, replay-proof identity; source_type/source_id are
-- provenance only (populate both-or-neither, never query by them).
ALTER TABLE "coin_transactions" ADD COLUMN IF NOT EXISTS "dedupe_key"    varchar(200);
ALTER TABLE "coin_transactions" ADD COLUMN IF NOT EXISTS "source_type"   varchar(100);
ALTER TABLE "coin_transactions" ADD COLUMN IF NOT EXISTS "source_id"     varchar(255);
ALTER TABLE "coin_transactions" ADD COLUMN IF NOT EXISTS "balance_after" integer;

-- At most one ledger row per (user, dedupe_key). Legacy + opening-balance rows
-- carry a NULL key and are exempt via the partial predicate.
CREATE UNIQUE INDEX IF NOT EXISTS "coin_tx_user_dedupe_uniq"
  ON "coin_transactions" ("user_id", "dedupe_key")
  WHERE "dedupe_key" IS NOT NULL;

-- ── 2. Opening-balance backfill (reconciliation: SUM(ledger) == users.coins) ─
-- Insert one migration row per user so the ledger sums to their current coins
-- going forward. Idempotent: after it runs the per-user delta is 0, so a second
-- run (HAVING <> 0) inserts nothing.
INSERT INTO "coin_transactions"
  ("user_id", "amount", "reason", "label", "source_type", "created_at")
SELECT u."id",
       u."coins" - COALESCE(SUM(ct."amount"), 0),
       'migration_opening_balance',
       'Opening balance (ledger reconciliation)',
       'migration',
       now()
FROM "users" u
LEFT JOIN "coin_transactions" ct ON ct."user_id" = u."id"
GROUP BY u."id", u."coins"
HAVING u."coins" - COALESCE(SUM(ct."amount"), 0) <> 0;

-- ── 3. Non-negative balance invariant ───────────────────────────────────────
-- Pre-flight (read-only) confirmed 0 users with coins < 0 (min = 0) → safe.
-- DO block makes the constraint add idempotent (no ADD CONSTRAINT IF NOT EXISTS
-- in Postgres).
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_coins_nonneg" CHECK ("coins" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 4. Generalized per-day reward caps ──────────────────────────────────────
-- `bucket_date` is a UTC calendar day and MUST be written as such: app code
-- passes an explicit UTC-derived date, and any SQL that computes it MUST use
-- (now() AT TIME ZONE 'UTC')::date — never a bare now()::date, which resolves
-- against the connection's session TimeZone (not guaranteed UTC when pooled)
-- and would silently break the timezone-immunity guarantee.
CREATE TABLE IF NOT EXISTS "daily_reward_caps" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"     uuid NOT NULL,
  "reason"      varchar(100) NOT NULL,
  "bucket_date" date NOT NULL,
  "used_units"  integer NOT NULL DEFAULT 0,
  "updated_at"  timestamptz NOT NULL DEFAULT now(),
  -- FK named to match drizzle's convention (<table>_<col>_<reftable>_<refcol>_fk)
  -- so the schema and DB agree if the meta snapshot is ever rebaselined.
  CONSTRAINT "daily_reward_caps_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "daily_reward_caps_used_nonneg" CHECK ("used_units" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_reward_caps_user_reason_date_uniq"
  ON "daily_reward_caps" ("user_id", "reason", "bucket_date");


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (commented out — uncomment and run to fully undo this migration).
-- Dependency-safe order, every step guarded so a partial/re-run is safe.
-- WARNING: only valid BEFORE Batch 3 makes these columns load-bearing; after
-- Batch 3 ships, the app writes to these columns/table and this undo would
-- break the award path. Restore from your pre-apply Neon branch instead.
-- ───────────────────────────────────────────────────────────────────────────
-- -- 1. Drop the indexes first (coin_tx_user_dedupe_uniq depends on dedupe_key).
-- DROP INDEX IF EXISTS "coin_tx_user_dedupe_uniq";
-- DROP INDEX IF EXISTS "daily_reward_caps_user_reason_date_uniq";
--
-- -- 2. Drop the caps table (takes its FK, CHECK, PK, and remaining index with it).
-- DROP TABLE IF EXISTS "daily_reward_caps";
--
-- -- 3. Drop the balance invariant (coins column itself is retained).
-- ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_coins_nonneg";
--
-- -- 4. Remove the reconciliation backfill rows (no-op if already gone).
-- DELETE FROM "coin_transactions" WHERE "reason" = 'migration_opening_balance';
--
-- -- 5. Drop the ledger columns (index in step 1 already removed the dependency).
-- ALTER TABLE "coin_transactions" DROP COLUMN IF EXISTS "balance_after";
-- ALTER TABLE "coin_transactions" DROP COLUMN IF EXISTS "source_id";
-- ALTER TABLE "coin_transactions" DROP COLUMN IF EXISTS "source_type";
-- ALTER TABLE "coin_transactions" DROP COLUMN IF EXISTS "dedupe_key";
-- ═══════════════════════════════════════════════════════════════════════════
