import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, lt, isNotNull, isNull, or } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { events, eventRecurrence } from '@/db/schema';
import { expandRecurrence } from '@/lib/recurrence/rruleEngine';
import { apiError, logger } from '@/lib/logger';
import { utcToZonedWallClock } from '@/lib/time/zonedTime';

/**
 * Aggregate ceiling on instances in one response.
 *
 * 366 days is the widest window the route accepts, and a daily series fills it
 * with 366 occurrences — so this admits roughly eight full-year daily series,
 * or far more of anything less frequent, before it starts cutting.
 */
const MAX_TOTAL_INSTANCES = 3000;

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
      .where(
        and(
        // P2-9: the query pulled EVERY recurrence row the user owns, including
        // series that ended years ago, and then expanded each one. Rows whose
        // stored end date is already behind the window cannot contribute an
        // occurrence, so they are excluded before any expansion happens.
          eq(eventRecurrence.userId, userId),
          or(
            isNull(eventRecurrence.recurrenceEnd),
            gte(eventRecurrence.recurrenceEnd, rangeStart),
          ),
        ),
      );

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
    // P2-9: `MAX_INSTANCES = 500` in the engine is PER MASTER EVENT with no
    // aggregate cap, so 200 daily-recurring events over a 366-day window
    // materialised ~73,000 objects in one JSON response. The per-event cap
    // stays (it bounds CPU inside the rrule iterator); this bounds the response.
    let truncated = false;

    for (const { recurrence: rec, event: masterEvent } of recurrenceRows) {
      if (instances.length >= MAX_TOTAL_INSTANCES) {
        truncated = true;
        break;
      }
      const durationMs = masterEvent.endTime.getTime() - masterEvent.startTime.getTime();

      const expanded = expandRecurrence(
        {
          rrule: rec.rrule,
          dtstart: masterEvent.startTime.toISOString(),
          exdates: rec.exdates ?? [],
          // P2-9: written by six call sites, read by none. Without it a rule
          // whose end date lives in `recurrence_end` rather than in an `UNTIL=`
          // inside the RRULE text recurred forever.
          until: rec.recurrenceEnd,
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
        if (instances.length >= MAX_TOTAL_INSTANCES) {
          truncated = true;
          break;
        }

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
        if (instances.length >= MAX_TOTAL_INSTANCES) {
          truncated = true;
          break;
        }
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

    if (truncated) {
      logger.warn('expand truncated', {
        route: 'GET /api/events/expand',
        userId,
        returned: instances.length,
        seriesCount: recurrenceRows.length,
      });
    }

    // `truncated` is part of the contract, not a silent cut: a client that sees
    // it should narrow its window rather than render a partial month as if it
    // were complete.
    return NextResponse.json({ instances, truncated });
  } catch (err) {
    return apiError('GET /api/events/expand', err);
  }
}
