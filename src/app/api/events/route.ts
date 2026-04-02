import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { calendars, events, eventRecurrence, tasks } from '@/db/schema';

type EventProvider = 'local' | 'google' | 'outlook';
type ApiEventProvider = 'local' | 'google' | 'microsoft';
type EventSyncStatus = 'local_only' | 'synced' | 'pending_update' | 'pending_delete';
type EventSource = 'manual' | 'google' | 'microsoft' | 'scheduler';

function parseDateAndTime(date: unknown, time: unknown, fallback: string): Date | null {
  if (typeof date !== 'string') return null;
  const normalizedTime = typeof time === 'string' ? time : fallback;
  const parsed = new Date(`${date}T${normalizedTime}:00.000Z`);
  return isNaN(parsed.getTime()) ? null : parsed;
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
  return {
    id: row.id,
    title: row.title,
    date: row.startTime.toISOString().slice(0, 10),
    startTime: row.startTime.toISOString().slice(11, 16),
    endTime: row.endTime.toISOString().slice(11, 16),
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
      .where(and(eq(events.userId, userId), eq(events.provider, 'local')))
      .orderBy(events.startTime);

    return NextResponse.json(
      rows.map((row) => mapRowToApiEvent(row.event, row.calendarProvider ?? undefined)),
    );
  } catch (err) {
    console.error('[GET /api/events]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

  const provider: EventProvider = 'local';
  const syncStatus: EventSyncStatus = 'local_only';
  const source: EventSource = 'manual';

  const directStartAt = parseIso(startAt);
  const directEndAt = parseIso(endAt);

  const fallbackDate = typeof date === 'string' ? date : undefined;
  const startTs = directStartAt ?? parseDateAndTime(fallbackDate, startTime, '00:00');
  const endTs = directEndAt ?? parseDateAndTime(fallbackDate, endTime, '23:59');

  if (!startTs || !endTs) {
    return NextResponse.json({ error: 'Valid start and end timestamps are required' }, { status: 400 });
  }
  if (endTs <= startTs) {
    return NextResponse.json({ error: 'endAt must be after startAt' }, { status: 400 });
  }

  const linkedTaskId = typeof rawLinkedTaskId === 'string' && rawLinkedTaskId.trim() ? rawLinkedTaskId : null;
  const timezone = typeof rawTimezone === 'string' && rawTimezone.trim() ? rawTimezone : 'UTC';
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

    // Find or create the user's default local calendar
    let calendarId: string;
    const existing = await db
      .select({ id: calendars.id })
      .from(calendars)
      .where(and(eq(calendars.userId, userId), eq(calendars.provider, 'local'), eq(calendars.isPrimary, true)))
      .limit(1);

    if (existing.length > 0) {
      calendarId = existing[0].id;
    } else {
      const [newCal] = await db
        .insert(calendars)
        .values({ userId, provider: 'local', name: 'My Calendar', isPrimary: true })
        .returning({ id: calendars.id });
      calendarId = newCal.id;
    }

    const [row] = await db
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

    // If recurrence rule is provided, create the event_recurrence row
    const recurrenceRule = body.recurrence as { rrule?: string; exdates?: string[]; until?: string } | undefined;
    let recurrenceData = null;
    if (recurrenceRule && typeof recurrenceRule.rrule === 'string' && recurrenceRule.rrule.trim()) {
      const [recRow] = await db
        .insert(eventRecurrence)
        .values({
          eventId: row.id,
          userId,
          rrule: recurrenceRule.rrule.trim(),
          exdates: Array.isArray(recurrenceRule.exdates) ? recurrenceRule.exdates : [],
          recurrenceEnd: recurrenceRule.until ? new Date(recurrenceRule.until) : null,
        })
        .returning();
      recurrenceData = { id: recRow.id, rrule: recRow.rrule, exdates: recRow.exdates };
    }

    return NextResponse.json({ id: row.id, event: mapRowToApiEvent(row), recurrence: recurrenceData }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/events]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
