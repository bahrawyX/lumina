import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, lt } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { calendars, events, eventRecurrence, tasks } from '@/db/schema';
import { validateRRule } from '@/lib/recurrence/rruleEngine';
import { apiError, logger } from '@/lib/logger';
import { checkFieldLengths, FIELD_LIMITS } from '@/lib/fieldLimits';
import {
  isValidTimeZone,
  utcToZonedWallClock,
  zonedWallClockToUtc,
} from '@/lib/time/zonedTime';
import { resolveEventTimeZone } from '@/lib/time/eventTimeZone';
import { resolvePrimaryLocalCalendarId } from '@/lib/calendars/primaryLocal';
import { parseRange } from '@/lib/dateRange';
import { listHeaders, parseLimit } from '@/lib/listLimits';

type EventProvider = 'local' | 'google' | 'outlook';
type ApiEventProvider = 'local' | 'google' | 'microsoft';
type EventSyncStatus = 'local_only' | 'synced' | 'pending_update' | 'pending_delete';
type EventSource = 'manual' | 'google' | 'microsoft' | 'scheduler';

/**
 * Resolve a wall-clock date+time IN THE EVENT'S TIMEZONE to a true instant.
 *
 * This used to be:
 *
 *     const parsed = new Date(`${date}T${normalizedTime}:00.000Z`);
 *
 * -- always `Z`. "3pm" was stored as 15:00Z regardless of where the user was,
 * and the `events.timezone` column written beside it was read by nothing.
 * Display was self-consistent so the UI looked right, but every comparison
 * against a real instant (reminders, conflict detection, external sync) was
 * wrong by the user's UTC offset.
 */
function parseDateAndTime(
  date: unknown,
  time: unknown,
  fallback: string,
  timeZone: string,
): Date | null {
  if (typeof date !== 'string') return null;
  const normalizedTime = typeof time === 'string' ? time : fallback;
  return zonedWallClockToUtc(date, normalizedTime, timeZone);
}

function parseIso(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function mapProviderForApi(
  eventProviderValue: unknown,
  calendarProviderValue: unknown,
  sourceValue: unknown,
): ApiEventProvider {
  const calendarProvider =
    typeof calendarProviderValue === 'string' ? calendarProviderValue.toLowerCase() : '';
  if (calendarProvider === 'microsoft' || calendarProvider === 'outlook') return 'microsoft';
  if (calendarProvider === 'google') return 'google';

  const eventProvider =
    typeof eventProviderValue === 'string' ? eventProviderValue.toLowerCase() : '';
  if (eventProvider === 'outlook' || eventProvider === 'microsoft') return 'microsoft';
  if (eventProvider === 'google') return 'google';

  const source = typeof sourceValue === 'string' ? sourceValue.toLowerCase() : '';
  if (source === 'microsoft' || source === 'outlook') return 'microsoft';
  if (source === 'google') return 'google';

  return 'local';
}

function mapRowToApiEvent(
  row: typeof events.$inferSelect,
  calendarProvider?: string | null,
) {
  const provider = mapProviderForApi(row.provider, calendarProvider, row.source);
  const zone = isValidTimeZone(row.timezone ?? '') ? row.timezone : 'UTC';
  const start = utcToZonedWallClock(row.startTime, zone);
  const end = utcToZonedWallClock(row.endTime, zone);
  return {
    id: row.id,
    title: row.title,
    // Rendered in the EVENT'S timezone, not UTC. These were
    // `.toISOString().slice(...)`, which reads the UTC fields directly —
    // correct only while storage was itself floating UTC.
    date: start.date,
    // The end timestamp carries its own date — an event may span days.
    // Dropping it here is what made End Date always mirror Start Date.
    endDate: end.date,
    startTime: start.time,
    endTime: end.time,
    description: row.description ?? undefined,
    location: row.location ?? undefined,
    isAllDay: row.isAllDay,
    timezone: row.timezone,
    category: row.category ?? undefined,
    color: row.color ?? undefined,
    completed: row.completed,
    linkedTaskId: row.linkedTaskId,
    provider,
    externalEventId: row.externalEventId ?? row.externalId ?? undefined,
    externalEtag: row.externalEtag ?? undefined,
    sourceUpdatedAt: row.sourceUpdatedAt?.toISOString(),
    syncStatus: row.syncStatus,
    meetingUrl: row.meetingUrl ?? undefined,
    organizerEmail: row.organizerEmail ?? undefined,
    source: row.source,
    outlookId: provider === 'microsoft' ? (row.externalEventId ?? row.externalId ?? undefined) : undefined,
    recurringEventId: row.recurringEventId ?? undefined,
    originalStartTime: row.originalStartTime?.toISOString() ?? undefined,
    isRecurrenceException: row.isRecurrenceException,
    createdViaNL: row.createdViaNl,
  };
}

/** GET /api/events — return all events for the authenticated user */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  // P2-7: this returned EVERY event the user has ever created, unpaginated and
  // unfiltered, on every page load — and nothing in the product deletes them,
  // so the cost only grows. `?from`/`?to` narrows it; `?limit` caps it.
  const { searchParams } = new URL(req.url);
  const limitResult = parseLimit(searchParams.get('limit'));
  if (limitResult.kind === 'error') {
    return NextResponse.json({ error: limitResult.message }, { status: 400 });
  }
  const { limit } = limitResult;

  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  let window: { start: Date; end: Date } | null = null;
  if (fromParam || toParam) {
    // Rejects an over-wide window rather than truncating it — the same choice
    // `/api/events/expand` and `parseRange` already make.
    const range = parseRange(fromParam, toParam, {
      defaultStart: new Date(0),
      defaultEnd: new Date('2100-01-01T00:00:00.000Z'),
    });
    if (range.kind === 'error') {
      return NextResponse.json({ error: range.message }, { status: 400 });
    }
    window = { start: range.start, end: range.end };
  }

  try {
    const db = getDatabase();
    const rows = await db
      .select({
        event: events,
        calendarProvider: calendars.provider,
      })
      .from(events)
      .leftJoin(calendars, eq(events.calendarId, calendars.id))
      // External provider events are no longer stored in the DB.
      // Only local (Lumina-owned) events live here; Google/Microsoft events
      // are fetched on demand and cached in the browser via /api/external-events/*.
      .where(
        and(
          eq(events.userId, userId),
          eq(events.provider, 'local'),
          // An event that ENDS after the window starts and STARTS before it
          // ends overlaps it — a multi-day event straddling the boundary has to
          // come back, so this is not a plain `start_time BETWEEN`.
          window ? gte(events.endTime, window.start) : undefined,
          window ? lt(events.startTime, window.end) : undefined,
        ),
      )
      .orderBy(events.startTime)
      .limit(limit);

    if (rows.length >= limit) {
      logger.warn('list truncated', { route: 'GET /api/events', userId, limit });
    }

    return NextResponse.json(
      rows.map((row) => mapRowToApiEvent(row.event, row.calendarProvider ?? undefined)),
      { headers: listHeaders(rows.length, limit) },
    );
  } catch (err) {
    return apiError('GET /api/events', err);
  }
}

/** POST /api/events — create a new event for the authenticated user */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    title: rawTitle,
    date,
    endDate,
    startTime,
    endTime,
    startAt,
    endAt,
    description,
    location,
    isAllDay,
    timezone: rawTimezone,
    category: rawCategory,
    color: rawColor,
    completed,
    linkedTaskId: rawLinkedTaskId,
    externalEventId,
    externalId,
    externalEtag,
    sourceUpdatedAt: rawSourceUpdatedAt,
    meetingUrl,
    organizerEmail,
    createdViaNL: rawCreatedViaNL,
  } = body;

  const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  // P3-2: `events.title` is varchar(512); nothing bounded it.
  const tooLong = checkFieldLengths({
    title: { value: title, max: FIELD_LIMITS.title },
    description: { value: description, max: FIELD_LIMITS.description },
    location: { value: location, max: FIELD_LIMITS.location },
  });
  if (tooLong) return tooLong;

  const provider: EventProvider = 'local';
  const syncStatus: EventSyncStatus = 'local_only';
  const source: EventSource = 'manual';

  const directStartAt = parseIso(startAt);
  const directEndAt = parseIso(endAt);

  const fallbackDate = typeof date === 'string' ? date : undefined;
  // An event may end on a later day than it starts. Fall back to the start
  // date only when no endDate was supplied (single-day event).
  const fallbackEndDate = typeof endDate === 'string' ? endDate : fallbackDate;
  // The zone the wall-clock fields are expressed in. Falls back to the user's
  // stored timezone, then UTC — never to the server's, which on Vercel is UTC
  // and was the source of the original defect.
  const timezone = await resolveEventTimeZone(getDatabase(), userId, rawTimezone);

  const startTs = directStartAt ?? parseDateAndTime(fallbackDate, startTime, '00:00', timezone);
  const endTs = directEndAt ?? parseDateAndTime(fallbackEndDate, endTime, '23:59', timezone);

  if (!startTs || !endTs) {
    return NextResponse.json({ error: 'Valid start and end timestamps are required' }, { status: 400 });
  }
  if (endTs <= startTs) {
    return NextResponse.json({ error: 'endAt must be after startAt' }, { status: 400 });
  }

  const linkedTaskId = typeof rawLinkedTaskId === 'string' && rawLinkedTaskId.trim() ? rawLinkedTaskId : null;
  const category = typeof rawCategory === 'string' && rawCategory.trim() ? rawCategory.trim() : null;
  const color = typeof rawColor === 'string' && rawColor.trim() ? rawColor.trim() : null;
  const normalizedExternalEventId = typeof externalEventId === 'string' && externalEventId.trim()
    ? externalEventId
    : typeof externalId === 'string' && externalId.trim()
      ? externalId
      : null;
  const sourceUpdatedAt = parseIso(rawSourceUpdatedAt);

  try {
    const db = getDatabase();

    if (linkedTaskId) {
      const linkedTask = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, linkedTaskId), eq(tasks.userId, userId)))
        .limit(1);
      if (linkedTask.length === 0) {
        return NextResponse.json({ error: 'linkedTaskId is invalid for this user' }, { status: 400 });
      }
    }

    // P2-5: this was a find-then-insert with no ON CONFLICT and no re-select —
    // the exact default-calendar TOCTOU `create-linked` had already been fixed
    // for. Two concurrent first-use event creations both inserted and the loser
    // hit `calendars_one_primary_local_per_user` → unhandled 23505 → 500, on
    // the first event a new account ever creates. Both routes share one
    // idempotent resolver now.
    const calendarId = await resolvePrimaryLocalCalendarId(db, userId);
    if (!calendarId) {
      return NextResponse.json({ error: 'Failed to resolve default calendar' }, { status: 500 });
    }

    // P2-3: the event used to be INSERTed here and the RRULE validated only
    // afterwards, so an invalid rule returned 400 with the event already
    // committed — the client believed creation failed while an orphan event
    // sat in the calendar. `create-linked` already validated first; this now
    // matches it, and both rows commit together or not at all.
    //
    // Pre-validation also protects against DoS via pathological rules
    // (sub-daily frequencies, enormous COUNT/INTERVAL) that would blow up CPU
    // every time the engine later expands them.
    const recurrenceRule = body.recurrence as { rrule?: string; exdates?: string[]; until?: string } | undefined;
    const trimmedRrule =
      recurrenceRule && typeof recurrenceRule.rrule === 'string' && recurrenceRule.rrule.trim()
        ? recurrenceRule.rrule.trim()
        : null;

    if (trimmedRrule) {
      const validation = validateRRule(trimmedRrule, startTs);
      if (validation.ok === false) {
        return NextResponse.json(
          { error: `Invalid recurrence: ${validation.reason}` },
          { status: 400 },
        );
      }
    }

    const { row, recurrenceData } = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(events)
        .values({
          userId,
          calendarId,
          title,
          description: typeof description === 'string' ? description : null,
          location: typeof location === 'string' ? location : null,
          startTime: startTs,
          endTime: endTs,
          isAllDay: isAllDay === true,
          timezone,
          category,
          color,
          completed: completed === true,
          linkedTaskId,
          provider,
          externalEventId: normalizedExternalEventId,
          externalEtag: typeof externalEtag === 'string' ? externalEtag : null,
          sourceUpdatedAt,
          syncStatus,
          meetingUrl: typeof meetingUrl === 'string' ? meetingUrl : null,
          organizerEmail: typeof organizerEmail === 'string' ? organizerEmail : null,
          source,
          externalId: normalizedExternalEventId,
          lastSyncedAt: sourceUpdatedAt,
          createdViaNl: rawCreatedViaNL === true,
        })
        .returning();

      let rec: { id: string; rrule: string; exdates: string[] } | null = null;
      if (trimmedRrule) {
        const [recRow] = await tx
          .insert(eventRecurrence)
          .values({
            eventId: inserted.id,
            userId,
            rrule: trimmedRrule,
            exdates: Array.isArray(recurrenceRule?.exdates) ? recurrenceRule.exdates : [],
            // `new Date(recurrenceRule.until)` was unguarded: a junk `until`
            // produced an Invalid Date and the driver raised a type error
            // AFTER the event row was already committed.
            recurrenceEnd: parseIso(recurrenceRule?.until),
          })
          .returning();
        rec = { id: recRow.id, rrule: recRow.rrule, exdates: recRow.exdates };
      }

      return { row: inserted, recurrenceData: rec };
    });

    return NextResponse.json({ id: row.id, event: mapRowToApiEvent(row), recurrence: recurrenceData }, { status: 201 });
  } catch (err) {
    return apiError('POST /api/events', err);
  }
}
