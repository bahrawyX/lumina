-- 0019_achievements_unique
-- M6 — prevent duplicate achievement unlocks. Hand-authored (journal frozen at
-- 0008; see TD-1). Forward-only, idempotent.
--
-- Pre-flight on a Neon branch confirmed ZERO duplicate (user_id, type) rows, so
-- the unique index builds cleanly with no dedupe step. Paired with
-- onConflictDoNothing on the achievement insert (focus-sessions route).

CREATE UNIQUE INDEX IF NOT EXISTS "achievements_user_type_uniq"
  ON "achievements" ("user_id", "type");


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (uncomment to undo)
-- DROP INDEX IF EXISTS "achievements_user_type_uniq";
-- ═══════════════════════════════════════════════════════════════════════════
