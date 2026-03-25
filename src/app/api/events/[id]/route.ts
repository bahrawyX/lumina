import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { events, tasks } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
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
    title,
    description,
    location,
    isAllDay,
    timezone,
    category,
    color,
    completed,
    syncStatus,
    externalEtag,
    meetingUrl,
    organizerEmail,
    sourceUpdatedAt,
    externalEventId,
    externalId,
    linkedTaskId,
    startAt,
    endAt,
    date,
    startTime,
    endTime,
  } = body;

  try {
    const db = getDatabase();

    const existingRows = await db
      .select()
      .from(events)
      .where(and(eq(events.id, id), eq(events.userId, userId)))
      .limit(1);

    if (existingRows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const existing = existingRows[0];

    // Build a safe update payload — only allow known mutable fields
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof title === 'string' && title.trim()) {
      patch.title = title.trim();
    }
    if (typeof description === 'string') patch.description = description;
    if (typeof location === 'string') patch.location = location;
    if (typeof isAllDay === 'boolean') patch.isAllDay = isAllDay;
    if (typeof timezone === 'string' && timezone.trim()) patch.timezone = timezone;
    if (category === null) patch.category = null;
    else if (typeof category === 'string' && category.trim()) patch.category = category.trim();
    if (color === null) patch.color = null;
    else if (typeof color === 'string' && color.trim()) patch.color = color.trim();
    if (typeof completed === 'boolean') patch.completed = completed;
    if (typeof syncStatus === 'string' && ['local_only', 'synced', 'pending_update', 'pending_delete'].includes(syncStatus)) {
      patch.syncStatus = syncStatus;
    }
    if (typeof externalEtag === 'string') patch.externalEtag = externalEtag;
    if (typeof meetingUrl === 'string') patch.meetingUrl = meetingUrl;
    if (typeof organizerEmail === 'string') patch.organizerEmail = organizerEmail;

    if (sourceUpdatedAt === null) {
      patch.sourceUpdatedAt = null;
      patch.lastSyncedAt = null;
    } else if (typeof sourceUpdatedAt === 'string') {
      const parsed = new Date(sourceUpdatedAt);
      if (!isNaN(parsed.getTime())) {
        patch.sourceUpdatedAt = parsed;
        patch.lastSyncedAt = parsed;
      }
    }

    if (externalEventId === null || externalId === null) {
      patch.externalEventId = null;
      patch.externalId = null;
    } else {
      const nextExternal = typeof externalEventId === 'string'
        ? externalEventId
        : typeof externalId === 'string'
          ? externalId
          : undefined;
      if (typeof nextExternal === 'string') {
        patch.externalEventId = nextExternal;
        patch.externalId = nextExternal;
      }
    }

    if (linkedTaskId === null) {
      patch.linkedTaskId = null;
    } else if (typeof linkedTaskId === 'string' && linkedTaskId.trim()) {
      const linkedTaskRows = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, linkedTaskId), eq(tasks.userId, userId)))
        .limit(1);
      if (linkedTaskRows.length === 0) {
        return NextResponse.json({ error: 'linkedTaskId is invalid for this user' }, { status: 400 });
      }
      patch.linkedTaskId = linkedTaskId;
    }

    const parsedStartAt = typeof startAt === 'string' ? new Date(startAt) : null;
    const parsedEndAt = typeof endAt === 'string' ? new Date(endAt) : null;
    const dateStr = typeof date === 'string' ? date : existing.startTime.toISOString().slice(0, 10);
    const startStr = typeof startTime === 'string' ? startTime : existing.startTime.toISOString().slice(11, 16);
    const endStr = typeof endTime === 'string' ? endTime : existing.endTime.toISOString().slice(11, 16);

    if (parsedStartAt && !isNaN(parsedStartAt.getTime())) patch.startTime = parsedStartAt;
    if (parsedEndAt && !isNaN(parsedEndAt.getTime())) patch.endTime = parsedEndAt;

    if (!patch.startTime && (typeof date === 'string' || typeof startTime === 'string')) {
      const ts = new Date(`${dateStr}T${startStr}:00.000Z`);
      if (!isNaN(ts.getTime())) patch.startTime = ts;
    }
    if (!patch.endTime && (typeof date === 'string' || typeof endTime === 'string')) {
      const ts = new Date(`${dateStr}T${endStr}:00.000Z`);
      if (!isNaN(ts.getTime())) patch.endTime = ts;
    }

    const nextStart = (patch.startTime as Date | undefined) ?? existing.startTime;
    const nextEnd = (patch.endTime as Date | undefined) ?? existing.endTime;
    if (nextEnd <= nextStart) {
      return NextResponse.json({ error: 'endAt must be after startAt' }, { status: 400 });
    }

    await db
      .update(events)
      .set(patch)
      .where(and(eq(events.id, id), eq(events.userId, userId)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/events/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const db = getDatabase();
    await db
      .delete(events)
      .where(and(eq(events.id, id), eq(events.userId, userId)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/events/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
