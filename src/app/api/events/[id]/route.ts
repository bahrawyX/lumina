import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { events, eventRecurrence, tasks } from '@/db/schema';
import { validateRRule } from '@/lib/recurrence/rruleEngine';
import { eq, and, sql } from 'drizzle-orm';
import type { EditScope } from '@/types';
import { logger } from '@/lib/logger';
import { utcToZonedWallClock, zonedWallClockToUtc } from '@/lib/time/zonedTime';
import { resolveEventTimeZone } from '@/lib/time/eventTimeZone';
import { checkLinkedOwnership } from '@/lib/ownership';
import { invalidIdResponse, parseEventRouteId } from '@/lib/routeParams';
import { appendExdate } from '@/lib/recurrence/exdates';

interface RouteContext {
  params: Promise<{ id: string }>;
}


export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id: rawId } = await context.params;
  // P2-1: `events/[id]` also accepts the composite `masterId:isoDate` form for a
  // single occurrence of a series, so the uuid check applies to the segment
  // before the first ':' and the remainder must be a parseable instant.
  // Previously any junk went straight into `eq(events.id, id)` and Postgres
  // raised 22P02, surfacing as a generic 500.
  const parsedId = parseEventRouteId(rawId);
  if (!parsedId) return invalidIdResponse();
  const id = rawId;
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

      // P2-3: the exception INSERT and the exdate append were two unwrapped
      // writes. If the second failed, the series still expanded that occurrence
      // *and* the exception existed beside it — a duplicate the user could not
      // cleanly delete. They commit together now.
      const exception = await db.transaction(async (tx) => {
        const [row] = await tx
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

        await appendExdate(tx, masterEventId, userId, instanceStartIso);
        return row;
      });

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
    // P1-4: this was unchecked while the adjacent `linkedTaskId` IS correctly
    // verified, two lines below.
    const linkedDocId = body.linkedDocId;
    if (linkedDocId === null) {
      patch.linkedDocId = null;
    } else if (typeof linkedDocId === 'string' && linkedDocId.trim()) {
      const docFailure = await checkLinkedOwnership(db, userId, {
        linkedDocId: { value: linkedDocId, table: 'docs' },
      });
      if (docFailure) {
        return NextResponse.json({ error: 'linkedDocId not found' }, { status: 404 });
      }
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
    // The zone this event's wall-clock fields are expressed in. A PATCH may
    // change it; otherwise the event keeps the zone it was created in, so
    // editing "3pm" in a different browser timezone does not silently move it.
    const eventTimeZone = await resolveEventTimeZone(
      getDatabase(),
      userId,
      typeof body.timezone === 'string' ? body.timezone : existing.timezone,
    );
    const existingStart = utcToZonedWallClock(existing.startTime, eventTimeZone);
    const existingEnd = utcToZonedWallClock(existing.endTime, eventTimeZone);

    const dateStr = typeof date === 'string' ? date : existingStart.date;
    // The end timestamp keeps its own date so events can span days. Only when
    // no endDate is supplied does it inherit the (possibly new) start date.
    const endDateStr = typeof endDate === 'string'
      ? endDate
      : typeof date === 'string'
        ? date
        : existingEnd.date;
    const startStr = typeof startTime === 'string' ? startTime : existingStart.time;
    const endStr = typeof endTime === 'string' ? endTime : existingEnd.time;

    if (parsedStartAt && !isNaN(parsedStartAt.getTime())) patch.startTime = parsedStartAt;
    if (parsedEndAt && !isNaN(parsedEndAt.getTime())) patch.endTime = parsedEndAt;

    if (!patch.startTime && (typeof date === 'string' || typeof startTime === 'string')) {
      const ts = zonedWallClockToUtc(dateStr, startStr, eventTimeZone);
      if (ts) patch.startTime = ts;
    }
    if (!patch.endTime && (typeof date === 'string' || typeof endDate === 'string' || typeof endTime === 'string')) {
      const ts = zonedWallClockToUtc(endDateStr, endStr, eventTimeZone);
      if (ts) patch.endTime = ts;
    }
    // Keep the recorded zone in step with the instants derived from it.
    if (patch.startTime || patch.endTime) patch.timezone = eventTimeZone;

    const nextStart = (patch.startTime as Date | undefined) ?? existing.startTime;
    const nextEnd = (patch.endTime as Date | undefined) ?? existing.endTime;
    if (nextEnd <= nextStart) {
      return NextResponse.json({ error: 'endAt must be after startAt' }, { status: 400 });
    }

    // If editScope is 'all' and recurrence data is provided, update the rule too.
    const recurrenceBody = body.recurrence as { rrule?: string; exdates?: string[]; until?: string } | undefined;
    const updatesRecurrence =
      editScope === 'all' && recurrenceBody && typeof recurrenceBody.rrule === 'string';

    let recPatch: Record<string, unknown> | null = null;
    if (updatesRecurrence) {
      // Pre-validate the RRULE before storage (DoS protection) AND before the
      // event write, so a rejected rule cannot leave the times already changed.
      const dtstartForValidation = (patch.startTime as Date | undefined) ?? existing.startTime;
      const validation = validateRRule(recurrenceBody.rrule, dtstartForValidation);
      if (validation.ok === false) {
        return NextResponse.json(
          { error: `Invalid recurrence: ${validation.reason}` },
          { status: 400 },
        );
      }
      recPatch = { rrule: recurrenceBody.rrule, updatedAt: new Date() };
      if (Array.isArray(recurrenceBody.exdates)) {
        recPatch.exdates = recurrenceBody.exdates;
      }
      const until = recurrenceBody.until ? new Date(recurrenceBody.until) : null;
      // An unguarded `new Date(junk)` produced an Invalid Date that the driver
      // rejected *after* the event row had already been updated.
      if (until && !isNaN(until.getTime())) recPatch.recurrenceEnd = until;
    }

    // P2-3: `events` and `event_recurrence` were updated separately, so the
    // times could change while the rule update failed — anchoring the series to
    // a DTSTART that no longer matched it.
    await db.transaction(async (tx) => {
      await tx
        .update(events)
        .set(patch)
        .where(and(eq(events.id, id), eq(events.userId, userId)));

      if (recPatch) {
        await tx
          .update(eventRecurrence)
          .set(recPatch)
          .where(and(eq(eventRecurrence.eventId, id), eq(eventRecurrence.userId, userId)));
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('unhandled', { route: 'PATCH /api/events/[id]' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const { id: rawId } = await context.params;
  // P2-1: `events/[id]` also accepts the composite `masterId:isoDate` form for a
  // single occurrence of a series, so the uuid check applies to the segment
  // before the first ':' and the remainder must be a parseable instant.
  // Previously any junk went straight into `eq(events.id, id)` and Postgres
  // raised 22P02, surfacing as a generic 500.
  const parsedId = parseEventRouteId(rawId);
  if (!parsedId) return invalidIdResponse();
  const id = rawId;
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
      const touched = await appendExdate(db, masterEventId, userId, instanceStartIso);
      // P2-2: this answered 200 for a master event the user does not own (or
      // that has no recurrence rule), so "delete this occurrence" silently
      // did nothing and the occurrence reappeared on the next expand.
      if (touched.length === 0) {
        return NextResponse.json({ error: 'Recurring event not found' }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }

    // Handle deletion of 'this' for a real exception event.
    // The exdate was already appended to the master's recurrence when the
    // exception was created, so we only need to remove the exception row.
    if (editScope === 'this') {
      const deleted = await db
        .delete(events)
        .where(and(eq(events.id, id), eq(events.userId, userId)))
        .returning({ id: events.id });
      if (deleted.length === 0) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }

    // Handle 'this_and_following' — truncate the RRULE with UNTIL
    if (editScope === 'this_and_following' && originalStartTime) {
      const cutoffDate = new Date(originalStartTime);
      const cutoffBefore = new Date(cutoffDate.getTime() - 1000);

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

        // P2-3: truncating the rule and dropping the now-orphaned exceptions
        // were two unwrapped writes. If the second failed, exceptions survived
        // past the UNTIL and rendered as stray one-off events.
        await db.transaction(async (tx) => {
          await tx
            .update(eventRecurrence)
            .set({ rrule: updatedRRule, recurrenceEnd: cutoffBefore, updatedAt: new Date() })
            .where(and(eq(eventRecurrence.eventId, id), eq(eventRecurrence.userId, userId)));

          // Delete any exceptions at or after the cutoff
          await tx.execute(
            sql`DELETE FROM events WHERE recurring_event_id = ${id} AND user_id = ${userId} AND is_recurrence_exception = true AND original_start_time >= ${cutoffDate}`,
          );
        });
      }

      return NextResponse.json({ ok: true });
    }

    // Default: delete 'all' — delete the master event (cascade handles recurrence + exceptions)
    // Exceptions, then the rule, then the master.
    //
    // P2-3: three unwrapped writes. A failure after the first left a series
    // whose exceptions were gone but whose master still expanded them.
    const deleted = await db.transaction(async (tx) => {
      await tx.execute(
        sql`DELETE FROM events WHERE recurring_event_id = ${id} AND user_id = ${userId}`,
      );
      await tx
        .delete(eventRecurrence)
        .where(and(eq(eventRecurrence.eventId, id), eq(eventRecurrence.userId, userId)));
      return tx
        .delete(events)
        .where(and(eq(events.id, id), eq(events.userId, userId)))
        .returning({ id: events.id });
    });

    // P2-2: DELETE reported success for an id that never existed.
    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('unhandled', { route: 'DELETE /api/events/[id]' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
