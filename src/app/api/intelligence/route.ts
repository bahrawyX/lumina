import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gt, gte, lt } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { events, eventRecurrence, focusSessions, integrations, plannerItems, tasks } from '@/db/schema';
import { expandRecurrence } from '@/lib/recurrence/rruleEngine';
import { fetchGoogleExternalEvents } from '@/lib/integrations/google/fetchExternalEvents';
import { fetchMicrosoftExternalEvents } from '@/lib/integrations/microsoft/fetchExternalEvents';
import { getEnabledCalendarIds } from '@/lib/integrations/enabledCalendars';
import { buildIntelligenceNarrative } from '@/lib/intelligence/llmSummary';
import { runIntelligenceEngine } from '@/lib/intelligence/engine';
import type {
  IntelligenceCalendarEvent,
  IntelligenceFocusSession,
  IntelligencePlannedItem,
  IntelligenceTask,
} from '@/lib/intelligence/types';
import { logger } from '@/lib/logger';

const DEFAULT_RANGE_DAYS_PAST = 1;
const DEFAULT_RANGE_DAYS_FUTURE = 14;
const DEFAULT_MIN_FOCUS_WINDOW_MINUTES = 60;
const DEFAULT_FOCUS_HISTORY_DAYS = 30;

function parseIsoOrDefault(value: string | null, fallbackMs: number): string {
  if (!value) return new Date(fallbackMs).toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date(fallbackMs).toISOString();
  return parsed.toISOString();
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
}

function mapLocalEvents(rows: Array<typeof events.$inferSelect>): IntelligenceCalendarEvent[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    provider: 'local',
    startIso: row.startTime.toISOString(),
    endIso: row.endTime.toISOString(),
    isAllDay: row.isAllDay,
    timezone: row.timezone,
    category: row.category,
  }));
}

function mapTasks(rows: Array<typeof tasks.$inferSelect>): IntelligenceTask[] {
  return rows.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status as IntelligenceTask['status'],
    priority: task.priority,
    dueDateIso: task.dueDate ? task.dueDate.toISOString() : null,
    estimatedMinutes: Math.max(1, task.estimatedMinutes),
    context: null,
  }));
}

function mapFocusSessions(rows: Array<typeof focusSessions.$inferSelect>): IntelligenceFocusSession[] {
  return rows.map((session) => ({
    id: session.id,
    startIso: session.startTime.toISOString(),
    endIso: session.endTime.toISOString(),
    durationMinutes: session.durationMinutes,
  }));
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const now = Date.now();
  const { searchParams } = new URL(req.url);

  const startIso = parseIsoOrDefault(
    searchParams.get('start'),
    now - DEFAULT_RANGE_DAYS_PAST * 86_400_000,
  );
  const endIso = parseIsoOrDefault(
    searchParams.get('end'),
    now + DEFAULT_RANGE_DAYS_FUTURE * 86_400_000,
  );

  const minFocusWindowMinutes = parsePositiveInt(
    searchParams.get('minFocusWindowMinutes'),
    DEFAULT_MIN_FOCUS_WINDOW_MINUTES,
  );

  const timezone = searchParams.get('timezone')?.trim() || 'UTC';
  const includeNarrative = searchParams.get('includeNarrative') === '1';

  try {
    const db = getDatabase();
    const startDate = new Date(startIso);
    const endDate = new Date(endIso);
    const historyStartDate = new Date(now - DEFAULT_FOCUS_HISTORY_DAYS * 86_400_000);

    // Compute today's boundaries in the user's timezone for planner query
    const todayInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
    const todayStart = new Date(todayInTz.getFullYear(), todayInTz.getMonth(), todayInTz.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86_400_000);

    const [localEventRows, taskRows, focusRows, integrationRows, plannerRows] = await Promise.all([
      db
        .select()
        .from(events)
        .where(
          and(
            eq(events.userId, userId),
            eq(events.provider, 'local'),
            lt(events.startTime, endDate),
            gt(events.endTime, startDate),
          ),
        ),
      db
        .select()
        .from(tasks)
        .where(eq(tasks.userId, userId)),
      db
        .select()
        .from(focusSessions)
        .where(
          and(
            eq(focusSessions.userId, userId),
            gte(focusSessions.startTime, historyStartDate),
          ),
        ),
      db
        .select({ provider: integrations.provider, status: integrations.status, expiresAt: integrations.expiresAt })
        .from(integrations)
        .where(eq(integrations.userId, userId)),
      db
        .select({
          taskId: plannerItems.taskId,
          startTime: plannerItems.startTime,
          endTime: plannerItems.endTime,
          taskTitle: tasks.title,
        })
        .from(plannerItems)
        // Batch 5 (M2): scope the join by tasks.userId so a planner row pointing
        // at another user's task can never pull that task's title in.
        .leftJoin(tasks, and(eq(plannerItems.taskId, tasks.id), eq(tasks.userId, userId)))
        .where(
          and(
            eq(plannerItems.userId, userId),
            gte(plannerItems.startTime, todayStart),
            lt(plannerItems.startTime, todayEnd),
          ),
        )
        .catch((err) => {
          logger.error('planner_items query failed', { route: 'GET /api/intelligence' }, err);
          return [] as { taskId: string; startTime: Date; endTime: Date; taskTitle: string | null }[];
        }),
    ]);

    const hasGoogle = integrationRows.some(
      (row) => row.provider === 'google' && row.status === 'active' && row.expiresAt > new Date(),
    );
    const hasMicrosoft = integrationRows.some(
      (row) =>
        (row.provider === 'microsoft' || row.provider === 'outlook')
        && row.status === 'active'
        && row.expiresAt > new Date(),
    );

    const [googleEvents, microsoftEvents] = await Promise.all([
      hasGoogle
        ? (async () => {
            const ids = await getEnabledCalendarIds(userId, 'google');
            return fetchGoogleExternalEvents(userId, startIso, endIso, ids);
          })().catch((err) => {
            logger.error('Google fetch failed', { route: 'GET /api/intelligence' }, err);
            return [];
          })
        : Promise.resolve([]),
      hasMicrosoft
        ? (async () => {
            const ids = await getEnabledCalendarIds(userId, 'microsoft');
            return fetchMicrosoftExternalEvents(userId, startIso, endIso, ids);
          })().catch((err) => {
            logger.error('Microsoft fetch failed', { route: 'GET /api/intelligence' }, err);
            return [];
          })
        : Promise.resolve([]),
    ]);

    // Expand recurring events into virtual instances within the intelligence range
    const recurrenceRows = await db
      .select({ recurrence: eventRecurrence, event: events })
      .from(eventRecurrence)
      .innerJoin(events, eq(eventRecurrence.eventId, events.id))
      .where(eq(eventRecurrence.userId, userId))
      .catch(() => [] as { recurrence: typeof eventRecurrence.$inferSelect; event: typeof events.$inferSelect }[]);

    const recurringInstances: IntelligenceCalendarEvent[] = [];
    for (const { recurrence: rec, event: masterEvent } of recurrenceRows) {
      const durationMs = masterEvent.endTime.getTime() - masterEvent.startTime.getTime();
      const expanded = expandRecurrence(
        { rrule: rec.rrule, dtstart: masterEvent.startTime.toISOString(), exdates: rec.exdates ?? [] },
        startDate,
        endDate,
        durationMs,
        masterEvent.timezone ?? 'UTC',
      );
      for (const inst of expanded) {
        recurringInstances.push({
          id: `recurring:${masterEvent.id}:${inst.startIso}`,
          title: masterEvent.title,
          provider: 'local',
          startIso: inst.startIso,
          endIso: inst.endIso,
          isAllDay: masterEvent.isAllDay,
          timezone: masterEvent.timezone,
          category: masterEvent.category,
        });
      }
    }

    const localEvents = mapLocalEvents(localEventRows);
    const externalGoogle: IntelligenceCalendarEvent[] = googleEvents.map((event) => ({
      id: `google:${event.externalEventId}`,
      title: event.title,
      provider: 'google' as const,
      startIso: event.startIso,
      endIso: event.endIso,
      isAllDay: event.isAllDay,
      timezone: event.timezone,
      category: 'work',
    }));
    const externalMicrosoft: IntelligenceCalendarEvent[] = microsoftEvents.map((event) => ({
      id: `microsoft:${event.externalEventId}`,
      title: event.title,
      provider: 'microsoft' as const,
      startIso: event.startIso,
      endIso: event.endIso,
      isAllDay: event.isAllDay,
      timezone: event.timezone,
      category: 'work',
    }));

    const plannedItems: IntelligencePlannedItem[] = plannerRows.map((row) => ({
      taskId: row.taskId,
      taskTitle: row.taskTitle ?? 'Untitled task',
      startIso: row.startTime.toISOString(),
      endIso: row.endTime.toISOString(),
    }));

    const output = runIntelligenceEngine({
      userId,
      timezone,
      rangeStartIso: startIso,
      rangeEndIso: endIso,
      minFocusWindowMinutes,
      calendarEvents: [...localEvents, ...recurringInstances, ...externalGoogle, ...externalMicrosoft],
      tasks: mapTasks(taskRows),
      focusSessions: mapFocusSessions(focusRows),
      plannedItems,
    });

    const narrative = includeNarrative
      ? await buildIntelligenceNarrative(output, { useLlm: false, plannedItems })
      : null;

    return NextResponse.json({
      ok: true,
      ...output,
      narrative,
      sources: {
        localEvents: localEvents.length,
        googleEvents: externalGoogle.length,
        microsoftEvents: externalMicrosoft.length,
        tasks: taskRows.length,
        focusSessions: focusRows.length,
      },
    });
  } catch (err) {
    logger.error('unhandled', { route: 'GET /api/intelligence' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
