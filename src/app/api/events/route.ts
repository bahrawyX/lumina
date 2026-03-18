import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { calendars, events, tasks } from '@/db/schema';

type EventProvider = 'local' | 'google' | 'outlook';
type EventSyncStatus = 'local_only' | 'synced' | 'pending_update' | 'pending_delete';
type EventSource = 'manual' | 'google' | 'microsoft' | 'scheduler';

function normalizeProvider(providerValue: unknown, sourceValue: unknown): EventProvider {
  const provider = typeof providerValue === 'string' ? providerValue.toLowerCase() : '';
  if (provider === 'google') return 'google';
  if (provider === 'outlook' || provider === 'microsoft') return 'outlook';
  if (provider === 'local' || provider === 'manual' || provider === 'lumina') return 'local';

  const source = typeof sourceValue === 'string' ? sourceValue.toLowerCase() : '';
  if (source === 'google') return 'google';
  if (source === 'microsoft' || source === 'outlook') return 'outlook';
  return 'local';
}

function normalizeSyncStatus(value: unknown): EventSyncStatus {
  if (value === 'synced' || value === 'pending_update' || value === 'pending_delete') return value;
  return 'local_only';
}

function normalizeSource(value: unknown, provider: EventProvider): EventSource {
  const source = typeof value === 'string' ? value.toLowerCase() : '';

  // Explicit legacy source mappings at API boundary:
  // lumina/local -> manual, outlook -> microsoft
  if (source === 'manual' || source === 'google' || source === 'microsoft' || source === 'scheduler') {
    return source;
  }
  if (source === 'lumina' || source === 'local') {
    return 'manual';
  }
  if (source === 'outlook') {
    return 'microsoft';
  }

  if (provider === 'google') return 'google';
  if (provider === 'outlook') return 'microsoft';
  return 'manual';
}

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

function mapRowToApiEvent(row: typeof events.$inferSelect) {
  const provider = row.provider;
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
    category: row.category,
    color: row.color,
    completed: row.isCompleted,
    linkedTaskId: row.linkedTaskId,
    provider,
    externalEventId: row.externalEventId ?? row.externalId ?? undefined,
    externalEtag: row.externalEtag ?? undefined,
    sourceUpdatedAt: row.sourceUpdatedAt?.toISOString(),
    syncStatus: row.syncStatus,
    meetingUrl: row.meetingUrl ?? undefined,
    organizerEmail: row.organizerEmail ?? undefined,
    source: row.source,
    outlookId: provider === 'outlook' ? (row.externalEventId ?? row.externalId ?? undefined) : undefined,
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
      .select()
      .from(events)
      .where(eq(events.userId, userId))
      .orderBy(events.startTime);

    return NextResponse.json(rows.map(mapRowToApiEvent));
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

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const provider = normalizeProvider(body.provider, body.source);
  const syncStatus = normalizeSyncStatus(body.syncStatus);
  const source = normalizeSource(body.source, provider);

  const directStartAt = parseIso(body.startAt);
  const directEndAt = parseIso(body.endAt);

  const fallbackDate = typeof body.date === 'string' ? body.date : undefined;
  const startTs = directStartAt ?? parseDateAndTime(fallbackDate, body.startTime, '00:00');
  const endTs = directEndAt ?? parseDateAndTime(fallbackDate, body.endTime, '23:59');

  if (!startTs || !endTs) {
    return NextResponse.json({ error: 'Valid start and end timestamps are required' }, { status: 400 });
  }
  if (endTs <= startTs) {
    return NextResponse.json({ error: 'endAt must be after startAt' }, { status: 400 });
  }

  const linkedTaskId = typeof body.linkedTaskId === 'string' && body.linkedTaskId.trim() ? body.linkedTaskId : null;
  const timezone = typeof body.timezone === 'string' && body.timezone.trim() ? body.timezone : 'UTC';
  const category = typeof body.category === 'string' && body.category.trim() ? body.category : 'work';
  const color = typeof body.color === 'string' && body.color.trim() ? body.color : '#6D59E0';
  const externalEventId = typeof body.externalEventId === 'string' && body.externalEventId.trim()
    ? body.externalEventId
    : typeof body.externalId === 'string' && body.externalId.trim()
      ? body.externalId
      : null;
  const sourceUpdatedAt = parseIso(body.sourceUpdatedAt);

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
        description: typeof body.description === 'string' ? body.description : null,
        location: typeof body.location === 'string' ? body.location : null,
        startTime: startTs,
        endTime: endTs,
        isAllDay: body.isAllDay === true,
        timezone,
        category,
        color,
        isCompleted: body.completed === true,
        linkedTaskId,
        provider,
        externalEventId,
        externalEtag: typeof body.externalEtag === 'string' ? body.externalEtag : null,
        sourceUpdatedAt,
        syncStatus,
        meetingUrl: typeof body.meetingUrl === 'string' ? body.meetingUrl : null,
        organizerEmail: typeof body.organizerEmail === 'string' ? body.organizerEmail : null,
        source,
        externalId: externalEventId,
        lastSyncedAt: sourceUpdatedAt,
      })
      .returning();

    return NextResponse.json({ id: row.id, event: mapRowToApiEvent(row) }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/events]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
