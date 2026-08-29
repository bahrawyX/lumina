-- Recurring tasks.
--
-- Events have supported recurrence from the start; tasks had none, so "water
-- the plants every Tuesday" — the most ordinary thing a to-do list is asked to
-- do — could not be expressed at all.
--
-- The model is next-occurrence, not expansion. Events expand because a calendar
-- renders a range; a task is worked and then done, so expanding would fill the
-- board with identical future rows nobody can act on. A recurring task exists
-- once, and completing it spawns the next one.
--
-- All three columns are nullable with no default, so this is safe on a table
-- with rows: existing tasks simply do not repeat.

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "recurrence_rule" text;

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "recurrence_end" timestamptz;

-- Deliberately NOT a foreign key to tasks(id). Deleting the original must not
-- cascade away occurrences the user has already completed — those are their
-- record of work done, not dependents of the template.
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "recurrence_parent_id" uuid;

-- Finding every occurrence spawned from one original, for series-wide edits.
CREATE INDEX IF NOT EXISTS "tasks_recurrence_parent_idx"
  ON "tasks" ("recurrence_parent_id");
