import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, lt, isNotNull } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { events, eventRecurrence } from '@/db/schema';
import { expandRecurrence } from '@/lib/recurrence/rruleEngine';
import { logger } from '@/lib/logger';
import { utcToZonedWallClock } from '@/lib/time/zonedTime';

/**
 * GET /api/events/expand?start=ISO&end=ISO
 *
 * Returns virtual instances of recurring events within the given window.
 * Non-recurring events are NOT returned here — the client fetches those
 * from GET /api/events and merges.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');

  if (!startParam || !endParam) {
    return NextResponse.json({ error: 'start and end query params are required' }, { status: 400 });
  }

  const rangeStart = new Date(startParam);
  const rangeEnd = new Date(endParam);
  if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  const diffMs = rangeEnd.getTime() - rangeStart.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays > 366) {
    return NextResponse.json(
      { error: 'Window too large. Maximum 366 days per request.' },
      { status: 400 },
    );
  }

  try {
    const db = getDatabase();

    // Fetch all recurring events for this user that have a recurrence rule
    const recurrenceRows = await db
      .select({
        recurrence: eventRecurrence,
        event: events,
      })
      .from(eventRecurrence)
      .innerJoin(events, eq(eventRecurrence.eventId, events.id))
      .where(eq(eventRecurrence.userId, userId));

    // Also fetch exception instances (modified single occurrences)
    const exceptionRows = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.userId, userId),
          eq(events.isRecurrenceException, true),
          isNotNull(events.recurringEventId),
          gte(events.startTime, rangeStart),
          lt(events.startTime, rangeEnd),
        ),
      );

    const instances: Array<Record<string, unknown>> = [];

    for (const { recurrence: rec, event: masterEvent } of recurrenceRows) {
      const durationMs = masterEvent.endTime.getTime() - masterEvent.startTime.getTime();

      const expanded = expandRecurrence(
        {
          rrule: rec.rrule,
          dtstart: masterEvent.startTime.toISOString(),
          exdates: rec.exdates ?? [],
        },
        rangeStart,
        rangeEnd,
        durationMs,
        // Expand against the event's local clock so a 3pm daily event stays at
        // 3pm across a DST transition instead of drifting an hour.
        masterEvent.timezone ?? 'UTC',
      );
      const masterZone = masterEvent.timezone ?? 'UTC';

      // Find exceptions for this master event
      const exceptions = exceptionRows.filter(
        (ex) => ex.recurringEventId === masterEvent.id,
      );
      const exceptionOriginalTimes = new Set(
        exceptions.map((ex) => ex.originalStartTime?.toISOString()),
      );

      for (const inst of expanded) {
        // Skip if there's an exception that replaces this occurrence
        if (exceptionOriginalTimes.has(inst.startIso)) continue;

        instances.push({
          id: `${masterEvent.id}:${inst.startIso}`,
          instanceId: `${masterEvent.id}:${inst.startIso}`,
          masterEventId: masterEvent.id,
          title: masterEvent.title,
          description: masterEvent.description,
          // Rendered in the event's zone, not UTC.
          date: utcToZonedWallClock(new Date(inst.startIso), masterZone).date,
          startTime: utcToZonedWallClock(new Date(inst.startIso), masterZone).time,
          endTime: utcToZonedWallClock(new Date(inst.endIso), masterZone).time,
          startIso: inst.startIso,
          endIso: inst.endIso,
          isAllDay: masterEvent.isAllDay,
          timezone: masterEvent.timezone,
          category: masterEvent.category,
          color: masterEvent.color,
          completed: false,
          linkedTaskId: masterEvent.linkedTaskId,
          provider: 'local',
          source: masterEvent.source,
          location: masterEvent.location,
          meetingUrl: masterEvent.meetingUrl,
          isRecurringInstance: true,
          isRecurrenceException: false,
          recurrence: {
            rrule: rec.rrule,
            exdates: rec.exdates,
          },
        });
      }

      // Add exception instances
      for (const ex of exceptions) {
        instances.push({
          id: ex.id,
          masterEventId: ex.recurringEventId,
          title: ex.title,
          description: ex.description,
          date: utcToZonedWallClock(ex.startTime, ex.timezone ?? 'UTC').date,
          startTime: utcToZonedWallClock(ex.startTime, ex.timezone ?? 'UTC').time,
          endTime: utcToZonedWallClock(ex.endTime, ex.timezone ?? 'UTC').time,
          startIso: ex.startTime.toISOString(),
          endIso: ex.endTime.toISOString(),
          isAllDay: ex.isAllDay,
          timezone: ex.timezone,
          category: ex.category,
          color: ex.color,
          completed: ex.completed,
          linkedTaskId: ex.linkedTaskId,
          provider: 'local',
          source: ex.source,
          location: ex.location,
          meetingUrl: ex.meetingUrl,
          isRecurringInstance: true,
          isRecurrenceException: true,
          originalStartTime: ex.originalStartTime?.toISOString(),
        });
      }
    }

    return NextResponse.json({ instances });
  } catch (err) {
    logger.error('unhandled', { route: 'GET /api/events/expand' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
