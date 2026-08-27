-- ============================================================================
-- 0022_task_position
--
-- Manual board order for tasks was never persisted.
--
-- `GET /api/tasks` synthesised the field on every read:
--
--     .orderBy(tasks.createdAt);
--     ...
--     order: index,
--
-- there was no `order`/`position` column on `tasks`, and `PATCH /api/tasks/[id]`
-- ignored the field entirely. So the drag-reorder fan-out
--
--     updated.forEach(t => tasksPersistence.updateOne(t.id, { order: t.order }));
--
-- issued N HTTP requests that each wrote nothing, and the board snapped back to
-- created-at order on the next reload. (The audit reported this as P1-17 —
-- "order permanently divergent from the database" — which understates it: the
-- order never reached the database at all.)
--
-- Also adds the two composite indexes P2-7 asked for. `tasks` had only
-- single-column `(user_id)` and `(status)`, matching no real query shape; the
-- hot reads are the board (user + status + position) and the due-date list.
--
-- Additive and idempotent. `ADD COLUMN ... DEFAULT 0 NOT NULL` on a nullable-free
-- default is a metadata-only change on Postgres 11+, so no table rewrite.
-- ============================================================================

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- Seed each user's existing tasks with their current created-at order, per
-- status column — so the first render after this migration matches what the
-- user was looking at before it, rather than collapsing every task to 0.
--
-- The guard is "no task anywhere has a non-zero position", NOT "this task is at
-- position 0". The latter looks like a one-shot guard and is not: position 0 is
-- the NORMAL state of the top card in every column, and the default for every
-- task created after this migration. Re-running with that guard rewrites every
-- top card to its created-at rank — silently destroying manual ordering and
-- creating duplicate positions. Reproduced: a board ordered C,A,B came back
-- C=2, A=1, B=2.
--
-- This condition is true exactly once, immediately after the column is added
-- with DEFAULT 0, so the seeding runs once and every later run is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "tasks" WHERE "position" <> 0) THEN
    UPDATE "tasks" t
    SET "position" = seeded.rn
    FROM (
      SELECT
        id,
        (row_number() OVER (PARTITION BY user_id, status ORDER BY created_at) - 1) AS rn
      FROM "tasks"
    ) AS seeded
    WHERE t.id = seeded.id;
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tasks_user_status_position_idx"
  ON "tasks" ("user_id", "status", "position");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tasks_user_due_idx"
  ON "tasks" ("user_id", "due_date");
