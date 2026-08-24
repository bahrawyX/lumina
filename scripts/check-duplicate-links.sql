-- ============================================================================
-- check-duplicate-links.sql — READ ONLY
--
-- Reports what migration 0024 would clear before it creates
-- `tasks_linked_event_uniq` / `events_linked_task_uniq`.
--
-- Run this first if you want the list. It changes nothing: no UPDATE, no DDL.
-- An empty result means 0024 has nothing to repair and only creates the two
-- indexes.
-- ============================================================================

\echo '── tasks claiming the same event ───────────────────────────────────────'

SELECT t.linked_event_id                                     AS event_id,
       count(*)                                              AS claiming_tasks,
       array_agg(t.id ORDER BY t.created_at, t.id)           AS task_ids,
       (SELECT e.linked_task_id FROM events e
         WHERE e.id = t.linked_event_id)                     AS event_points_back_at
  FROM tasks t
 WHERE t.linked_event_id IS NOT NULL
 GROUP BY t.linked_event_id
HAVING count(*) > 1
 ORDER BY count(*) DESC;

\echo ''
\echo '── events claiming the same task ───────────────────────────────────────'

SELECT e.linked_task_id                                      AS task_id,
       count(*)                                              AS claiming_events,
       array_agg(e.id ORDER BY e.created_at, e.id)           AS event_ids,
       (SELECT t.linked_event_id FROM tasks t
         WHERE t.id = e.linked_task_id)                      AS task_points_back_at
  FROM events e
 WHERE e.linked_task_id IS NOT NULL
 GROUP BY e.linked_task_id
HAVING count(*) > 1
 ORDER BY count(*) DESC;

\echo ''
\echo '── one-sided links (not repaired by 0024, informational) ───────────────'

-- A task pointing at an event that does not point back, where no OTHER task
-- claims that event either. 0024 leaves these alone: they are single claims,
-- so the unique index accepts them. Listed because they are the residue of the
-- same race and you may want to reconcile them separately.
SELECT t.id AS task_id, t.linked_event_id AS event_id
  FROM tasks t
  LEFT JOIN events e ON e.id = t.linked_event_id
 WHERE t.linked_event_id IS NOT NULL
   AND (e.id IS NULL OR e.linked_task_id IS DISTINCT FROM t.id)
 ORDER BY t.created_at
 LIMIT 200;
