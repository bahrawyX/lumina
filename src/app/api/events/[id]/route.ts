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

    if (typeof body.title === 'string' && body.title.trim()) {
      patch.title = body.title.trim();
    }
    if (typeof body.description === 'string') patch.description = body.description;
    if (typeof body.location === 'string') patch.location = body.location;
    if (typeof body.isAllDay === 'boolean') patch.isAllDay = body.isAllDay;
    if (typeof body.timezone === 'string' && body.timezone.trim()) patch.timezone = body.timezone;
    if (typeof body.category === 'string' && body.category.trim()) patch.category = body.category;
    if (typeof body.color === 'string' && body.color.trim()) patch.color = body.color;
    if (typeof body.completed === 'boolean') patch.isCompleted = body.completed;
    if (typeof body.syncStatus === 'string' && ['local_only', 'synced', 'pending_update', 'pending_delete'].includes(body.syncStatus)) {
      patch.syncStatus = body.syncStatus;
    }
    if (typeof body.externalEtag === 'string') patch.externalEtag = body.externalEtag;
    if (typeof body.meetingUrl === 'string') patch.meetingUrl = body.meetingUrl;
    if (typeof body.organizerEmail === 'string') patch.organizerEmail = body.organizerEmail;

    if (body.sourceUpdatedAt === null) {
      patch.sourceUpdatedAt = null;
      patch.lastSyncedAt = null;
    } else if (typeof body.sourceUpdatedAt === 'string') {
      const parsed = new Date(body.sourceUpdatedAt);
      if (!isNaN(parsed.getTime())) {
        patch.sourceUpdatedAt = parsed;
        patch.lastSyncedAt = parsed;
      }
    }

    if (body.externalEventId === null || body.externalId === null) {
      patch.externalEventId = null;
      patch.externalId = null;
    } else {
      const nextExternal = typeof body.externalEventId === 'string'
        ? body.externalEventId
        : typeof body.externalId === 'string'
          ? body.externalId
          : undefined;
      if (typeof nextExternal === 'string') {
        patch.externalEventId = nextExternal;
        patch.externalId = nextExternal;
      }
    }

    if (body.linkedTaskId === null) {
      patch.linkedTaskId = null;
    } else if (typeof body.linkedTaskId === 'string' && body.linkedTaskId.trim()) {
      const linkedTaskRows = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, body.linkedTaskId), eq(tasks.userId, userId)))
        .limit(1);
      if (linkedTaskRows.length === 0) {
        return NextResponse.json({ error: 'linkedTaskId is invalid for this user' }, { status: 400 });
      }
      patch.linkedTaskId = body.linkedTaskId;
    }

    const startAt = typeof body.startAt === 'string' ? new Date(body.startAt) : null;
    const endAt = typeof body.endAt === 'string' ? new Date(body.endAt) : null;
    const dateStr = typeof body.date === 'string' ? body.date : existing.startTime.toISOString().slice(0, 10);
    const startStr = typeof body.startTime === 'string' ? body.startTime : existing.startTime.toISOString().slice(11, 16);
    const endStr = typeof body.endTime === 'string' ? body.endTime : existing.endTime.toISOString().slice(11, 16);

    if (startAt && !isNaN(startAt.getTime())) patch.startTime = startAt;
    if (endAt && !isNaN(endAt.getTime())) patch.endTime = endAt;

    if (!patch.startTime && (typeof body.date === 'string' || typeof body.startTime === 'string')) {
      const ts = new Date(`${dateStr}T${startStr}:00.000Z`);
      if (!isNaN(ts.getTime())) patch.startTime = ts;
    }
    if (!patch.endTime && (typeof body.date === 'string' || typeof body.endTime === 'string')) {
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
