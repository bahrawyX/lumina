import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { events, eventRecurrence, tasks } from '@/db/schema';
import { validateRRule } from '@/lib/recurrence/rruleEngine';
import { eq, and } from 'drizzle-orm';
import type { EditScope } from '@/types';

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
    endDate,
    startTime,
    endTime,
    editScope: rawEditScope,
    originalStartTime: rawOriginalStartTime,
  } = body;

  const editScope = (typeof rawEditScope === 'string' && ['this', 'this_and_following', 'all'].includes(rawEditScope))
    ? rawEditScope as EditScope
    : undefined;

  try {
    const db = getDatabase();

    // For 'this' scope on a virtual recurring instance, the ID is "masterEventId:isoDate"
    // We need to create an exception event instead of updating
    if (editScope === 'this' && typeof id === 'string' && id.includes(':')) {
      const [masterEventId, instanceStartIso] = id.split(':');
      const masterRows = await db
        .select()
        .from(events)
        .where(and(eq(events.id, masterEventId), eq(events.userId, userId)))
        .limit(1);

      if (masterRows.length === 0) {
        return NextResponse.json({ error: 'Master event not found' }, { status: 404 });
      }
      const master = masterRows[0];
      const instanceStart = new Date(instanceStartIso);
      const durationMs = master.endTime.getTime() - master.startTime.getTime();
      const instanceEnd = new Date(instanceStart.getTime() + durationMs);

      // Create exception event
      const [exception] = await db
        .insert(events)
        .values({
          userId,
          calendarId: master.calendarId,
          title: typeof title === 'string' && title.trim() ? title.trim() : master.title,
          description: typeof description === 'string' ? description : master.description,
          location: typeof location === 'string' ? location : master.location,
          startTime: typeof startAt === 'string' ? new Date(startAt) : instanceStart,
          endTime: typeof endAt === 'string' ? new Date(endAt) : instanceEnd,
          isAllDay: typeof isAllDay === 'boolean' ? isAllDay : master.isAllDay,
          timezone: typeof timezone === 'string' ? timezone : master.timezone,
          category: typeof category === 'string' ? category : master.category,
          color: typeof color === 'string' ? color : master.color,
          completed: typeof completed === 'boolean' ? completed : false,
          linkedTaskId: typeof linkedTaskId === 'string' ? linkedTaskId : master.linkedTaskId,
          provider: master.provider,
          syncStatus: master.syncStatus,
          source: master.source,
          recurringEventId: masterEventId,
          originalStartTime: instanceStart,
          isRecurrenceException: true,
        })
        .returning();

      // Add exdate to the recurrence rule
      const { sql } = await import('drizzle-orm');
      await db.execute(
        sql`UPDATE event_recurrence SET exdates = array_append(exdates, ${instanceStartIso}), updated_at = NOW() WHERE event_id = ${masterEventId} AND user_id = ${userId}`,
      );

      return NextResponse.json({ ok: true, exceptionId: exception.id });
    }

    // ── this_and_following PATCH: split the series ──────────────────────────
    if (editScope === 'this_and_following') {
      const instanceStartIso = typeof rawOriginalStartTime === 'string' ? rawOriginalStartTime : null;
      if (!instanceStartIso) {
        return NextResponse.json({ error: 'originalStartTime required for this_and_following' }, { status: 400 });
      }

      // Resolve the real master ID (composite or plain)
      const masterEventId = id.includes(':') ? id.split(':')[0] : id;

      const masterRows = await db
        .select()
        .from(events)
        .where(and(eq(events.id, masterEventId), eq(events.userId, userId)))
        .limit(1);
      if (masterRows.length === 0) {
        return NextResponse.json({ error: 'Master event not found' }, { status: 404 });
      }
      const master = masterRows[0];

      const recRows = await db
        .select()
        .from(eventRecurrence)
        .where(and(eq(eventRecurrence.eventId, masterEventId), eq(eventRecurrence.userId, userId)))
        .limit(1);
      if (recRows.length === 0) {
        return NextResponse.json({ error: 'No recurrence rule found for this event' }, { status: 400 });
      }
      const originalRec = recRows[0];

      const cutoffDate = new Date(instanceStartIso);
      const cutoffBefore = new Date(cutoffDate.getTime() - 1000);
      const untilStr = cutoffBefore.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

      // Truncate old RRULE: strip existing UNTIL/COUNT, add UNTIL before the split point
      const oldRRule = originalRec.rrule;
      const truncatedRRule = (oldRRule.includes('UNTIL=') || oldRRule.includes('COUNT='))
        ? oldRRule.replace(/;?(UNTIL|COUNT)=[^;]*/g, '') + `;UNTIL=${untilStr}`
        : oldRRule + `;UNTIL=${untilStr}`;

      // Build patched fields for the new master from the incoming body
      const durationMs = master.endTime.getTime() - master.startTime.getTime();
      const newStartTime = typeof startAt === 'string' ? new Date(startAt as string) : cutoffDate;
      const newEndTime = typeof endAt === 'string' ? new Date(endAt as string) : new Date(newStartTime.getTime() + durationMs);

      const { sql } = await import('drizzle-orm');

      const result = await db.transaction(async (tx) => {
        // 1. Truncate original series
        await tx
          .update(eventRecurrence)
          .set({ rrule: truncatedRRule, recurrenceEnd: cutoffBefore, updatedAt: new Date() })
          .where(and(eq(eventRecurrence.eventId, masterEventId), eq(eventRecurrence.userId, userId)));

        // Delete future exceptions from the original series
        await tx.execute(
          sql`DELETE FROM events WHERE recurring_event_id = ${masterEventId} AND user_id = ${userId} AND is_recurrence_exception = true AND original_start_time >= ${cutoffDate}`,
        );

        // 2. Create new master event with patches applied
        const [newMaster] = await tx
          .insert(events)
          .values({
            userId,
            calendarId: master.calendarId,
            title: typeof title === 'string' && title.trim() ? title.trim() : master.title,
            description: typeof description === 'string' ? description : master.description,
            location: typeof location === 'string' ? location : master.location,
            startTime: newStartTime,
            endTime: newEndTime,
            isAllDay: typeof isAllDay === 'boolean' ? isAllDay : master.isAllDay,
            timezone: typeof timezone === 'string' ? timezone : master.timezone,
            category: typeof category === 'string' ? category : master.category,
            color: typeof color === 'string' ? color : master.color,
            completed: false,
            linkedTaskId: typeof linkedTaskId === 'string' ? linkedTaskId : master.linkedTaskId,
            provider: master.provider,
            syncStatus: master.syncStatus,
            source: master.source,
            meetingUrl: typeof meetingUrl === 'string' ? meetingUrl : master.meetingUrl,
            organizerEmail: typeof organizerEmail === 'string' ? organizerEmail : master.organizerEmail,
          })
          .returning();

        // 3. Create new recurrence rule for the new master (fresh exdates)
        const newRRule = oldRRule.replace(/;?(UNTIL|COUNT)=[^;]*/g, '');
        const [newRec] = await tx
          .insert(eventRecurrence)
          .values({
            eventId: newMaster.id,
            userId,
            rrule: newRRule || oldRRule,
            exdates: [],
            recurrenceEnd: originalRec.recurrenceEnd,
          })
          .returning();

        return { newMasterId: newMaster.id, newRecurrenceId: newRec.id };
      });

      return NextResponse.json({ ok: true, id: result.newMasterId, recurrenceId: result.newRecurrenceId });
    }

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

    // linkedDocId
    const linkedDocId = body.linkedDocId;
    if (linkedDocId === null) {
      patch.linkedDocId = null;
    } else if (typeof linkedDocId === 'string' && linkedDocId.trim()) {
      patch.linkedDocId = linkedDocId;
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
    // The end timestamp keeps its own date so events can span days. Only when
    // no endDate is supplied does it inherit the (possibly new) start date.
    const endDateStr = typeof endDate === 'string'
      ? endDate
      : typeof date === 'string'
        ? date
        : existing.endTime.toISOString().slice(0, 10);
    const startStr = typeof startTime === 'string' ? startTime : existing.startTime.toISOString().slice(11, 16);
    const endStr = typeof endTime === 'string' ? endTime : existing.endTime.toISOString().slice(11, 16);

    if (parsedStartAt && !isNaN(parsedStartAt.getTime())) patch.startTime = parsedStartAt;
    if (parsedEndAt && !isNaN(parsedEndAt.getTime())) patch.endTime = parsedEndAt;

    if (!patch.startTime && (typeof date === 'string' || typeof startTime === 'string')) {
      const ts = new Date(`${dateStr}T${startStr}:00.000Z`);
      if (!isNaN(ts.getTime())) patch.startTime = ts;
    }
    if (!patch.endTime && (typeof date === 'string' || typeof endDate === 'string' || typeof endTime === 'string')) {
      const ts = new Date(`${endDateStr}T${endStr}:00.000Z`);
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

    // If editScope is 'all' and recurrence data is provided, update the recurrence rule
    const recurrenceBody = body.recurrence as { rrule?: string; exdates?: string[]; until?: string } | undefined;
    if (editScope === 'all' && recurrenceBody && typeof recurrenceBody.rrule === 'string') {
      // Pre-validate RRULE before storage (DoS protection).
      const dtstartForValidation = (patch.startTime as Date | undefined) ?? existing.startTime;
      const validation = validateRRule(recurrenceBody.rrule, dtstartForValidation);
      if (validation.ok === false) {
        return NextResponse.json(
          { error: `Invalid recurrence: ${validation.reason}` },
          { status: 400 },
        );
      }
      const recPatch: Record<string, unknown> = {
        rrule: recurrenceBody.rrule,
        updatedAt: new Date(),
      };
      if (Array.isArray(recurrenceBody.exdates)) {
        recPatch.exdates = recurrenceBody.exdates;
      }
      if (recurrenceBody.until) {
        recPatch.recurrenceEnd = new Date(recurrenceBody.until);
      }
      await db
        .update(eventRecurrence)
        .set(recPatch)
        .where(and(eq(eventRecurrence.eventId, id), eq(eventRecurrence.userId, userId)));
    }

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

  const { searchParams } = new URL(req.url);
  const editScope = searchParams.get('editScope') as EditScope | null;
  const originalStartTime = searchParams.get('originalStartTime');

  try {
    const db = getDatabase();

    // Handle deletion of a single virtual recurring instance
    if (editScope === 'this' && id.includes(':')) {
      const [masterEventId, instanceStartIso] = id.split(':');
      const { sql } = await import('drizzle-orm');
      await db.execute(
        sql`UPDATE event_recurrence SET exdates = array_append(exdates, ${instanceStartIso}), updated_at = NOW() WHERE event_id = ${masterEventId} AND user_id = ${userId}`,
      );
      return NextResponse.json({ ok: true });
    }

    // Handle deletion of 'this' for a real exception event.
    // The exdate was already appended to the master's recurrence when the
    // exception was created, so we only need to remove the exception row.
    if (editScope === 'this') {
      await db
        .delete(events)
        .where(and(eq(events.id, id), eq(events.userId, userId)));
      return NextResponse.json({ ok: true });
    }

    // Handle 'this_and_following' — truncate the RRULE with UNTIL
    if (editScope === 'this_and_following' && originalStartTime) {
      const cutoffDate = new Date(originalStartTime);
      const cutoffBefore = new Date(cutoffDate.getTime() - 1000);
      const { sql } = await import('drizzle-orm');

      // Get current RRULE
      const recRows = await db
        .select()
        .from(eventRecurrence)
        .where(and(eq(eventRecurrence.eventId, id), eq(eventRecurrence.userId, userId)))
        .limit(1);

      if (recRows.length > 0) {
        const currentRRule = recRows[0].rrule;
        // Add UNTIL to truncate the series
        const untilStr = cutoffBefore.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
        const updatedRRule = currentRRule.includes('UNTIL=') || currentRRule.includes('COUNT=')
          ? currentRRule.replace(/;?(UNTIL|COUNT)=[^;]*/g, '') + `;UNTIL=${untilStr}`
          : currentRRule + `;UNTIL=${untilStr}`;

        await db
          .update(eventRecurrence)
          .set({ rrule: updatedRRule, recurrenceEnd: cutoffBefore, updatedAt: new Date() })
          .where(and(eq(eventRecurrence.eventId, id), eq(eventRecurrence.userId, userId)));

        // Delete any exceptions at or after the cutoff
        await db.execute(
          sql`DELETE FROM events WHERE recurring_event_id = ${id} AND user_id = ${userId} AND is_recurrence_exception = true AND original_start_time >= ${cutoffDate}`,
        );
      }

      return NextResponse.json({ ok: true });
    }

    // Default: delete 'all' — delete the master event (cascade handles recurrence + exceptions)
    // First delete exceptions
    const { sql } = await import('drizzle-orm');
    await db.execute(
      sql`DELETE FROM events WHERE recurring_event_id = ${id} AND user_id = ${userId}`,
    );
    // Then delete the recurrence rule and master event
    await db
      .delete(eventRecurrence)
      .where(and(eq(eventRecurrence.eventId, id), eq(eventRecurrence.userId, userId)));
    await db
      .delete(events)
      .where(and(eq(events.id, id), eq(events.userId, userId)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/events/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
