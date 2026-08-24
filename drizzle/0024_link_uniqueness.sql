-- ============================================================================
-- 0024_link_uniqueness
--
-- P2-5 — task↔event linking had no uniqueness behind it.
--
-- `POST /api/link` and `POST /api/events/create-linked` both read "is this task
-- already linked?" OUTSIDE the transaction and then wrote. Two concurrent
-- `create-linked` calls therefore each created an event and each set
-- `tasks.linked_event_id`; the loser's event was permanently orphaned — invisible
-- to the task it belonged to, and with no UI path to find or delete it.
--
-- The routes now re-assert the condition in the UPDATE's WHERE and roll back on
-- zero rows. These indexes are the backstop under that: even a future call site
-- that forgets the guard cannot produce a second claim on the same row.
--
-- Both are PARTIAL — unlinked is the normal state and NULLs must stay
-- unconstrained (Postgres would allow unlimited NULLs in a plain unique index
-- anyway, but the partial form also keeps the index small).
--
-- ## The repair below
--
-- A unique index cannot be created over data that already violates it. If any
-- duplicate links exist in production this migration would fail and block the
-- deploy, so it repairs first, in the same transaction, in two deterministic
-- passes:
--
--   Pass 1 — drop the claims the counterpart does NOT point back at. The link is
--            bidirectional; if `events.linked_task_id` names one specific task,
--            every other task claiming that event is a stale half-write and
--            clearing it loses nothing.
--   Pass 2 — for anything still duplicated (both sides inconsistent), keep the
--            OLDEST row by `created_at` and clear the rest. Arbitrary, but
--            deterministic and re-runnable.
--
-- Neither pass deletes a task or an event. It only clears link pointers that
-- were already unreachable. `scripts/check-duplicate-links.sql` reports what
-- WOULD be cleared, without changing anything — run it first if you want the
-- list.
-- ============================================================================

-- ── tasks.linked_event_id ───────────────────────────────────────────────────

UPDATE tasks t
   SET linked_event_id = NULL,
       updated_at = now()
 WHERE t.linked_event_id IS NOT NULL
   AND EXISTS (
         SELECT 1 FROM tasks o
          WHERE o.linked_event_id = t.linked_event_id
            AND o.id <> t.id
       )
   AND NOT EXISTS (
         SELECT 1 FROM events e
          WHERE e.id = t.linked_event_id
            AND e.linked_task_id = t.id
       );
--> statement-breakpoint

UPDATE tasks t
   SET linked_event_id = NULL,
       updated_at = now()
 WHERE t.linked_event_id IS NOT NULL
   AND t.id <> (
         SELECT o.id
           FROM tasks o
          WHERE o.linked_event_id = t.linked_event_id
          ORDER BY o.created_at ASC, o.id ASC
          LIMIT 1
       );
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS tasks_linked_event_uniq
  ON tasks (linked_event_id)
  WHERE linked_event_id IS NOT NULL;
--> statement-breakpoint

-- ── events.linked_task_id ───────────────────────────────────────────────────

UPDATE events e
   SET linked_task_id = NULL,
       updated_at = now()
 WHERE e.linked_task_id IS NOT NULL
   AND EXISTS (
         SELECT 1 FROM events o
          WHERE o.linked_task_id = e.linked_task_id
            AND o.id <> e.id
       )
   AND NOT EXISTS (
         SELECT 1 FROM tasks t
          WHERE t.id = e.linked_task_id
            AND t.linked_event_id = e.id
       );
--> statement-breakpoint

UPDATE events e
   SET linked_task_id = NULL,
       updated_at = now()
 WHERE e.linked_task_id IS NOT NULL
   AND e.id <> (
         SELECT o.id
           FROM events o
          WHERE o.linked_task_id = e.linked_task_id
          ORDER BY o.created_at ASC, o.id ASC
          LIMIT 1
       );
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS events_linked_task_uniq
  ON events (linked_task_id)
  WHERE linked_task_id IS NOT NULL;
