-- ============================================================================
-- backfill-event-timezones.sql
--
-- P0-6 — event times were stored as floating wall-clock coerced to UTC.
--
--     const parsed = new Date(`${date}T${normalizedTime}:00.000Z`);   // always Z
--
-- "3pm" was written as 15:00Z regardless of where the user was, and the
-- `events.timezone` column recorded alongside it was read by nothing.
--
-- The code now stores true instants. **Rows written before that change are
-- still floating** and must be converted, or a UTC-5 user's existing 3pm
-- meeting will start reading as 10am the moment display becomes zone-aware.
--
-- ⚠  READ BEFORE RUNNING
--
--  1. This is the ONE step of the timezone fix that cannot be done from the
--     repository. Run it once, immediately after deploying the code change —
--     not before (new rows would be double-converted) and not long after (every
--     hour of drift is another row a user has looked at and believed).
--  2. Take a Neon branch first. This rewrites every event's start/end.
--  3. Run STEP 1 and STEP 2 and read them before running STEP 3.
--  4. STEP 3 is NOT idempotent. Running it twice shifts every event twice.
--     The guard column added in STEP 0 makes a second run a no-op; do not
--     remove it.
--
-- The conversion, in words: the stored value's UTC *fields* are the wall clock
-- the user typed. Reinterpret those fields in the event's timezone.
--
--     (start_time AT TIME ZONE 'UTC')      -> drops the zone, keeping 15:00
--     ... AT TIME ZONE tz                  -> reads 15:00 as local in tz
--
-- ============================================================================


-- ── STEP 0 · idempotency guard ──────────────────────────────────────────────
-- A marker so a second run cannot shift the same row again.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS tz_backfilled_at timestamptz;


-- ── STEP 1 · what will change, and for whom ─────────────────────────────────
-- Expect: one row per distinct timezone, with a count. If nearly everything is
-- 'UTC', either your users really are in UTC or `events.timezone` was never
-- populated — check STEP 2 before proceeding.

SELECT
  COALESCE(NULLIF(e.timezone, ''), u.timezone, 'UTC') AS effective_timezone,
  count(*)                                            AS events,
  min(e.start_time)                                   AS earliest,
  max(e.start_time)                                   AS latest
FROM events e
LEFT JOIN users u ON u.id = e.user_id
WHERE e.tz_backfilled_at IS NULL
GROUP BY 1
ORDER BY events DESC;


-- ── STEP 2 · a preview of the actual shift, per timezone ────────────────────
-- `new_start` is what STEP 3 will write. Sanity-check a few by hand: an event
-- the user believes is at 15:00 should still read 15:00 in `effective_timezone`
-- after the change.

SELECT
  e.id,
  e.title,
  COALESCE(NULLIF(e.timezone, ''), u.timezone, 'UTC') AS effective_timezone,
  e.start_time                                        AS old_start,
  (e.start_time AT TIME ZONE 'UTC')
    AT TIME ZONE COALESCE(NULLIF(e.timezone, ''), u.timezone, 'UTC') AS new_start,
  (e.start_time AT TIME ZONE 'UTC')
    AT TIME ZONE COALESCE(NULLIF(e.timezone, ''), u.timezone, 'UTC')
    - e.start_time                                    AS shift
FROM events e
LEFT JOIN users u ON u.id = e.user_id
WHERE e.tz_backfilled_at IS NULL
  AND COALESCE(NULLIF(e.timezone, ''), u.timezone, 'UTC') <> 'UTC'
ORDER BY e.start_time DESC
LIMIT 25;


-- ── STEP 3 · the conversion ────────────────────────────────────────────────
-- Wrapped in an explicit transaction so it can be inspected and rolled back.
-- Change ROLLBACK to COMMIT only once the row count matches STEP 1.

BEGIN;

UPDATE events e
SET
  start_time = (e.start_time AT TIME ZONE 'UTC')
                 AT TIME ZONE COALESCE(NULLIF(e.timezone, ''), u.timezone, 'UTC'),
  end_time   = (e.end_time   AT TIME ZONE 'UTC')
                 AT TIME ZONE COALESCE(NULLIF(e.timezone, ''), u.timezone, 'UTC'),
  -- Persist the zone that was actually used, so the column stops being a
  -- write-only field and every future read agrees with this conversion.
  timezone   = COALESCE(NULLIF(e.timezone, ''), u.timezone, 'UTC'),
  tz_backfilled_at = now()
FROM users u
WHERE u.id = e.user_id
  AND e.tz_backfilled_at IS NULL
  -- All-day events are date-only by intent; shifting them would move them
  -- across midnight for anyone east or west of UTC.
  AND e.is_all_day = false;

-- Mark all-day events as handled without touching their times, so a later run
-- does not reconsider them.
UPDATE events
SET tz_backfilled_at = now()
WHERE tz_backfilled_at IS NULL
  AND is_all_day = true;

-- Verify BEFORE committing: this must return zero.
SELECT count(*) AS still_unconverted FROM events WHERE tz_backfilled_at IS NULL;

ROLLBACK;   -- <<<< change to COMMIT when the preview and count look right


-- ── STEP 4 · recurrence anchors ────────────────────────────────────────────
-- `event_recurrence.recurrence_end` is a plain date and needs no conversion.
-- Occurrence times derive from the master event's `start_time`, which STEP 3
-- has already fixed, so nothing else is required here.
--
-- ── STEP 5 · afterwards ────────────────────────────────────────────────────
-- Keep `tz_backfilled_at`. It costs one nullable column and is the only record
-- that this ran, which is what makes a repeat safe to attempt.
