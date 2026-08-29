-- ============================================================================
-- diagnose-schema.sql — READ-ONLY. One statement, one result set.
--
-- `catch-up-schema.sql` aborted partway through on a real Neon database. It was
-- verified against PGlite starting from an EMPTY database and from one in a
-- specific known-broken state — neither of which is what a database that has
-- had 0000-0019 applied plus an unknown amount of `drizzle-kit push` drift
-- actually looks like.
--
-- This says what is really there, so the catch-up can be corrected precisely
-- instead of by guesswork. It reads catalogue views only: no writes, no locks,
-- no ALTER, safe on production.
--
-- Run it in the Neon SQL Editor and copy the whole result.
-- ============================================================================

WITH expected_tables(name) AS (
  VALUES
    ('users'), ('sessions'), ('accounts'), ('verifications'), ('rate_limits'),
    ('events'), ('event_recurrence'), ('calendars'), ('integrations'),
    ('tasks'), ('planner_items'), ('goals'), ('goal_targets'),
    ('focus_sessions'), ('mood_logs'), ('docs'), ('coin_transactions'),
    ('daily_reward_caps'), ('achievements'), ('push_subscriptions'),
    ('notification_sends'), ('daily_brief_cache')
),
-- The columns the auth path actually selects. A missing one here is the
-- difference between "sign-in works" and "every method 500s".
expected_columns(tbl, col) AS (
  VALUES
    ('users', 'onboarding_completed_at'),
    ('users', 'timezone'),
    ('users', 'coins'),
    ('users', 'daily_streak'),
    ('users', 'last_focus_date'),
    ('users', 'notification_preferences'),
    ('sessions', 'expires_at'),
    ('sessions', 'token'),
    ('rate_limits', 'key'),
    ('rate_limits', 'count'),
    ('rate_limits', 'last_request'),
    ('rate_limits', 'expires_at'),
    ('events', 'timezone'),
    ('events', 'tz_backfilled_at'),
    ('events', 'linked_task_id'),
    ('events', 'linked_doc_id'),
    ('tasks', 'position'),
    ('tasks', 'linked_event_id')
),
expected_enums(name) AS (
  VALUES
    ('calendar_provider'), ('event_provider'), ('event_source'),
    ('event_sync_status'), ('goal_status'), ('goal_timeframe'),
    ('target_type'), ('task_difficulty'), ('task_priority'), ('task_status'),
    ('integration_provider'), ('integration_status')
)
SELECT * FROM (
  SELECT 1 AS ord, 'TABLE'  AS kind, e.name AS object, ''  AS detail,
         CASE WHEN t.tablename IS NULL THEN 'MISSING' ELSE 'ok' END AS status
  FROM expected_tables e
  LEFT JOIN pg_tables t ON t.schemaname = 'public' AND t.tablename = e.name

  UNION ALL
  SELECT 2, 'COLUMN', e.tbl || '.' || e.col, COALESCE(c.data_type, ''),
         CASE WHEN c.column_name IS NULL THEN 'MISSING' ELSE 'ok' END
  FROM expected_columns e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public' AND c.table_name = e.tbl AND c.column_name = e.col

  UNION ALL
  SELECT 3, 'ENUM', e.name, '',
         CASE WHEN ty.typname IS NULL THEN 'MISSING' ELSE 'ok' END
  FROM expected_enums e
  LEFT JOIN pg_type ty
    ON ty.typname = e.name
   AND ty.typtype = 'e'
   AND ty.typnamespace = 'public'::regnamespace

  -- Extra tables the app does not know about are worth seeing too: they are
  -- usually the fingerprint of a `push` against a different schema version.
  UNION ALL
  SELECT 4, 'EXTRA TABLE', t.tablename, '', 'unexpected'
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND t.tablename NOT IN (SELECT name FROM expected_tables)
    AND t.tablename <> '__drizzle_migrations'

  -- Which migrations drizzle believes it has run. When this disagrees with the
  -- tables above, that disagreement IS the bug.
  -- Looked up in the catalogue rather than selected from: a direct query
  -- against a table that may not exist would abort this whole diagnostic,
  -- which is the exact failure mode it exists to explain.
  UNION ALL
  SELECT 5, 'DRIZZLE JOURNAL',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_tables
            WHERE tablename = '__drizzle_migrations'
         ) THEN 'journal table present' ELSE 'no journal table' END,
         '', 'info'
) q
ORDER BY ord, status DESC, object;
