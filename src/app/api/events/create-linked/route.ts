import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { events, eventRecurrence, tasks } from '@/db/schema';
import { validateRRule } from '@/lib/recurrence/rruleEngine';
import { logger } from '@/lib/logger';
import { zonedWallClockToUtc } from '@/lib/time/zonedTime';
import { resolveEventTimeZone } from '@/lib/time/eventTimeZone';
import { resolvePrimaryLocalCalendarId } from '@/lib/calendars/primaryLocal';

/**
 * POST /api/events/create-linked
 *
 * Atomically create an event AND link it to a task in a single DB transaction.
 * Eliminates the orphan-event risk of the two-call pattern (POST /api/events + POST /api/link).
 */

/** A concurrent request linked this task first; the transaction must roll back. */
class TaskAlreadyLinked extends Error {}

const createLinkedSchema = z.object({
  title: z.string().min(1, 'title is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'startTime must be HH:mm').optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'endTime must be HH:mm').optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  isAllDay: z.boolean().optional(),
  category: z.string().optional(),
  color: z.string().optional(),
  timezone: z.string().optional(),
  recurrence: z
    .object({
      rrule: z.string(),
      exdates: z.array(z.string()).optional(),
      until: z.string().optional(),
    })
    .optional(),
  taskId: z.string().uuid('taskId must be a valid UUID'),
});

/** See events/route.ts — wall clock resolved in the event's zone, not UTC. */
function parseDateAndTime(
  date: string,
  time: string | undefined,
  fallback: string,
  timeZone: string,
): Date | null {
  return zonedWallClockToUtc(date, time ?? fallback, timeZone);
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createLinkedSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 },
    );
  }

  const {
    title,
    date,
    startTime,
    endTime,
    description,
    location,
    isAllDay,
    category,
    color,
    timezone,
    recurrence,
    taskId,
  } = parsed.data;

  const eventTimeZone = await resolveEventTimeZone(getDatabase(), userId, timezone);
  const startTs = parseDateAndTime(date, startTime, '00:00', eventTimeZone);
  const endTs = parseDateAndTime(date, endTime, '23:59', eventTimeZone);

  if (!startTs || !endTs) {
    return NextResponse.json({ error: 'Invalid date/time values' }, { status: 400 });
  }
  if (endTs <= startTs) {
    return NextResponse.json({ error: 'endTime must be after startTime' }, { status: 400 });
  }

  // H5: validate the RRULE before persisting — the same DoS guard used by
  // POST /api/events. Pathological rules (sub-daily FREQ, enormous
  // COUNT/INTERVAL) are rejected here rather than exploding CPU on every later
  // expansion. Validate up front (fast-fail, clean 400) and reuse the trimmed
  // value inside the transaction.
  const trimmedRrule =
    recurrence && typeof recurrence.rrule === 'string' ? recurrence.rrule.trim() : '';
  if (trimmedRrule) {
    const validation = validateRRule(trimmedRrule, startTs);
    if (validation.ok === false) {
      return NextResponse.json(
        { error: `Invalid recurrence: ${validation.reason}` },
        { status: 400 },
      );
    }
  }

  try {
    const db = getDatabase();

    // ── Pre-checks (outside transaction for fast-fail) ──────────────────────

    // Verify task exists and belongs to user
    const [task] = await db
      .select({ id: tasks.id, linkedEventId: tasks.linkedEventId })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .limit(1);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // P2-5: "already linked?" is only a fast-fail. The authoritative check is
    // the guarded UPDATE inside the transaction below — reading it out here and
    // trusting it let two concurrent calls each create an event, and one was
    // permanently orphaned with no way for the user to find or delete it.
    if (task.linkedEventId) {
      return NextResponse.json(
        { error: 'Task is already linked to an event. Unlink first.' },
        { status: 409 },
      );
    }

    const calendarId = await resolvePrimaryLocalCalendarId(db, userId);
    if (!calendarId) {
      return NextResponse.json(
        { error: 'Failed to resolve default calendar' },
        { status: 500 },
      );
    }

    // ── Single atomic transaction ───────────────────────────────────────────

    const result = await db.transaction(async (tx) => {
      // 1. Insert event
      const [eventRow] = await tx
        .insert(events)
        .values({
          userId,
          calendarId,
          title,
          description: description ?? null,
          location: location ?? null,
          startTime: startTs,
          endTime: endTs,
          isAllDay: isAllDay ?? false,
          timezone: eventTimeZone,
          category: category ?? null,
          color: color ?? null,
          completed: false,
          linkedTaskId: taskId,
          provider: 'local',
          syncStatus: 'local_only',
          source: 'manual',
        })
        .returning({ id: events.id });

      const eventId = eventRow.id;

      // 2. Insert recurrence if provided (already validated above)
      let recurrenceId: string | null = null;
      if (trimmedRrule) {
        const [recRow] = await tx
          .insert(eventRecurrence)
          .values({
            eventId,
            userId,
            rrule: trimmedRrule,
            exdates: recurrence?.exdates ?? [],
            recurrenceEnd: recurrence?.until ? new Date(recurrence.until) : null,
          })
          .returning({ id: eventRecurrence.id });
        recurrenceId = recRow.id;
      }

      // 3. Link task → event, but ONLY if it is still unlinked. Zero rows here
      // means a concurrent request won the race; rolling back takes the event
      // we just inserted with it, so no orphan survives.
      const linked = await tx
        .update(tasks)
        .set({ linkedEventId: eventId, updatedAt: new Date() })
        .where(and(eq(tasks.id, taskId), isNull(tasks.linkedEventId)))
        .returning({ id: tasks.id });

      if (linked.length === 0) throw new TaskAlreadyLinked();

      return { eventId, recurrenceId };
    });

    return NextResponse.json(
      {
        eventId: result.eventId,
        recurrenceId: result.recurrenceId,
        taskId,
        linkedAt: new Date().toISOString(),
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof TaskAlreadyLinked) {
      return NextResponse.json(
        { error: 'Task is already linked to an event. Unlink first.' },
        { status: 409 },
      );
    }
    logger.error('unhandled', { route: 'POST /api/events/create-linked' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
