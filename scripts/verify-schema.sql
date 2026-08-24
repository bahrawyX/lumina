-- ============================================================================
-- verify-schema.sql — READ-ONLY.
--
-- Run this against production (or a Neon branch of it) and compare the output
-- to the repository. It answers the question P0-1 raised and the repo could not
-- previously answer: "does this environment actually match the schema?"
--
-- Nothing here writes, locks or alters anything. Safe to run on production.
-- ============================================================================

-- 1. Tables present. Compare to EXPECTED_TABLES in
--    tests/migrations-baseline.test.ts (21 tables).
SELECT 'TABLES' AS section, tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. Indexes present. The audit found ELEVEN declared indexes that appear in no
--    migration, so whether they exist depends entirely on whether someone ran
--    `push`. The ones that matter most:
--      coin_tx_user_dedupe_uniq   — the ledger's at-most-once guarantee. A
--                                   PARTIAL unique index, which is exactly the
--                                   kind of object `drizzle-kit push` drops.
--      coin_tx_user_created_idx   — without it, GET /api/coins is a seq-scan
--                                   plus sort on the largest append-only table.
--      docs full-text (GIN)       — without it, /api/docs/search recomputes
--                                   to_tsvector over every doc per keystroke.
SELECT 'INDEXES' AS section, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 3. CHECK constraints. `push` drops these silently too. Expect at least:
--      users_coins_nonneg
--      daily_reward_caps_used_nonneg
--      events_time_range_check
--      focus_sessions_duration_check
--      focus_sessions_time_range_check
SELECT 'CHECKS' AS section,
       rel.relname  AS table_name,
       con.conname  AS constraint_name,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public' AND con.contype = 'c'
ORDER BY rel.relname, con.conname;

-- 4. Foreign keys, with their ON DELETE behaviour. Account deletion (P2-14)
--    relies on every child table cascading from `users`.
SELECT 'FOREIGN KEYS' AS section,
       rel.relname AS table_name,
       con.conname AS constraint_name,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public' AND con.contype = 'f'
ORDER BY rel.relname, con.conname;

-- 5. Enum types and their values.
SELECT 'ENUMS' AS section,
       t.typname AS enum_name,
       string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS values
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY t.typname
ORDER BY t.typname;

-- 6. Which migrations Drizzle believes it has applied. An EMPTY result (or a
--    missing table) means this environment was built with `push` and has never
--    been migrated — in which case run `npm run db:migrate` once; the 0020
--    baseline is idempotent, so it is a no-op on an already-correct database.
SELECT 'APPLIED MIGRATIONS' AS section, *
FROM drizzle.__drizzle_migrations
ORDER BY created_at;
