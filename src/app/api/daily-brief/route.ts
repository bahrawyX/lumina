import { NextRequest, NextResponse } from 'next/server';
import { eq, and, lt, gt, gte, ne, or, isNull } from 'drizzle-orm';
import { GoogleGenAI } from '@google/genai';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { userDayBounds } from '@/lib/time/userDay';
import {
  events,
  tasks,
  plannerItems,
  focusSessions,
  users,
  dailyBriefCache,
  eventRecurrence,
} from '@/db/schema';
import { detectFocusWindows } from '@/lib/intelligence/focusWindows';
import { expandRecurrence } from '@/lib/recurrence/rruleEngine';
import type { IntelligenceCalendarEvent, IntelligencePlannedItem } from '@/lib/intelligence/types';
import { createRateLimiter, rateLimitedResponse } from '@/lib/rateLimit';
import { apiError, logger } from '@/lib/logger';

// The cached daily-brief path is cheap. The `?refresh=true` path re-runs
// the Gemini narrative generation, which costs real money and seconds of
// latency. Cap it to prevent a user from spamming regenerations.
const briefRefreshLimiter = createRateLimiter('dailyBriefRefresh', {
  windowMs: 60 * 60 * 1000,
  max: 6,
});

interface DailyBriefData {
  date: string;
  eventCount: number;
  nextEvent: {
    title: string;
    startTime: string;
    minutesUntil: number;
  } | null;
  meetingHours: number;
  bestFocusWindow: {
    startTime: string;
    endTime: string;
    durationMinutes: number;
  } | null;
  topPriorityTask: {
    id: string;
    title: string;
    priority: 'high' | 'medium' | 'low';
    dueDate: string | null;
    estimatedMinutes: number;
  } | null;
  overdueCount: number;
  totalOpenTasks: number;
  plannedTaskCount: number;
  currentStreak: number;
  isStreakAtRisk: boolean;
  narrative: string;
  narrativeGeneratedAt: string;
}

function toHHmm(date: Date, timezone: string): string {
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
    hour12: false,
  });
}

function getGreetingTimeOfDay(timezone: string): string {
  const hour = parseInt(
    new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: timezone }),
    10,
  );
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function getDayOfWeek(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long' });
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const { searchParams } = new URL(req.url);
  const forceRefresh = searchParams.get('refresh') === 'true';

  // Gate the expensive cache-bypass path only.
  if (forceRefresh) {
    const limit = await briefRefreshLimiter.check(userId);
    if (limit.limited) {
      return rateLimitedResponse(limit.retryAfterMs);
    }
  }

  try {
    const db = getDatabase();
    const now = new Date();

    /**
     * P2-8: the day this brief is about comes from `users.timezone`, not from
     * the request.
     *
     * This route *required* a `?timezone=` query param and trusted it. Two
     * problems, one of them exploitable:
     *
     *  - `dailyBriefCache` is keyed on `(userId, date)`, and `date` was derived
     *    from that param — so a client could choose which cache row it read and
     *    wrote, and force a fresh generation on every request by naming a zone
     *    it had not used yet.
     *  - `new Date(y, m, d)` constructs in the **server's** zone, not the
     *    user's. On Vercel that is UTC, so `todayStart`/`todayEnd` were wrong
     *    by the user's offset for everyone outside it — the same defect P2-8
     *    fixed in the coin and planner paths, still live here.
     *
     * `userDayBounds` is the helper those paths already use, and it computes
     * the end as local midnight of the next calendar date rather than
     * `start + 24h`, which is what makes it correct on both DST days.
     */
    const { zone: timezone, date: todayStr, start: todayStart, end: todayEnd } =
      await userDayBounds(db, userId, now);

    const historyStart = new Date(now.getTime() - 7 * 86_400_000);

    // ── 6 parallel data fetches ──────────────────────────────────────────────
    const [
      eventRows,
      taskRows,
      plannerRows,
      focusRows,
      [userRow],
      cachedBrief,
      recurrenceRows,
    ] = await Promise.all([
      // 1. Today's events
      db
        .select()
        .from(events)
        .where(
          and(
            eq(events.userId, userId),
            lt(events.startTime, todayEnd),
            gt(events.endTime, todayStart),
          ),
        ),
      // 2. All non-done tasks
      db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, userId), ne(tasks.status, 'done'))),
      // 3. Today's planner items
      db
        .select({
          taskId: plannerItems.taskId,
          startTime: plannerItems.startTime,
          endTime: plannerItems.endTime,
          taskTitle: tasks.title,
        })
        .from(plannerItems)
        // Batch 5 (M2): scope the join by tasks.userId so a planner row pointing
        // at another user's task can never pull that task's title into the brief.
        .leftJoin(tasks, and(eq(plannerItems.taskId, tasks.id), eq(tasks.userId, userId)))
        .where(
          and(
            eq(plannerItems.userId, userId),
            gte(plannerItems.startTime, todayStart),
            lt(plannerItems.startTime, todayEnd),
          ),
        )
        .catch(() => [] as { taskId: string; startTime: Date; endTime: Date; taskTitle: string | null }[]),
      // 4. Recent focus sessions (7 days)
      db
        .select()
        .from(focusSessions)
        .where(
          and(eq(focusSessions.userId, userId), gte(focusSessions.startTime, historyStart)),
        ),
      // 5. User streak data
      db
        .select({
          name: users.name,
          dailyStreak: users.dailyStreak,
          coins: users.coins,
          lastFocusDate: users.lastFocusDate,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
      // 6. Cached narrative for today
      db
        .select()
        .from(dailyBriefCache)
        .where(and(eq(dailyBriefCache.userId, userId), eq(dailyBriefCache.date, todayStr)))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      // 7. Recurring events for expansion
      db
        .select({
          rrule: eventRecurrence.rrule,
          exdates: eventRecurrence.exdates,
          recurrenceEnd: eventRecurrence.recurrenceEnd,
          eventId: eventRecurrence.eventId,
          title: events.title,
          startTime: events.startTime,
          endTime: events.endTime,
          isAllDay: events.isAllDay,
          timezone: events.timezone,
          category: events.category,
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
              gte(eventRecurrence.recurrenceEnd, todayStart),
            ),
          ),
        ),
    ]);

    // ── Expand recurring events for today ────────────────────────────────────
    const recurringInstances: IntelligenceCalendarEvent[] = [];
    for (const rec of recurrenceRows) {
      const masterStart = new Date(rec.startTime);
      const masterEnd = new Date(rec.endTime);
      const durationMs = masterEnd.getTime() - masterStart.getTime();
      const instances = expandRecurrence(
        {
          rrule: rec.rrule,
          dtstart: masterStart.toISOString(),
          exdates: (rec.exdates ?? []) as string[],
          // P2-9: selected here since day one and never passed through.
          until: rec.recurrenceEnd,
        },
        todayStart,
        todayEnd,
        durationMs,
        rec.timezone ?? 'UTC',
      );
      for (const inst of instances) {
        recurringInstances.push({
          id: `recurring:${rec.eventId}:${inst.startIso}`,
          title: rec.title,
          provider: 'local',
          startIso: inst.startIso,
          endIso: inst.endIso,
          isAllDay: rec.isAllDay,
          timezone: rec.timezone,
          category: rec.category ?? undefined,
        });
      }
    }

    // ── Map to intelligence types ────────────────────────────────────────────
    const calendarEvents: IntelligenceCalendarEvent[] = [
      ...eventRows.map((e) => ({
        id: e.id,
        title: e.title,
        provider: 'local' as const,
        startIso: e.startTime.toISOString(),
        endIso: e.endTime.toISOString(),
        isAllDay: e.isAllDay,
        timezone: e.timezone,
        category: e.category ?? undefined,
      })),
      ...recurringInstances,
    ];

    const plannedItems: IntelligencePlannedItem[] = plannerRows.map((p) => ({
      taskId: p.taskId,
      taskTitle: p.taskTitle ?? '',
      startIso: p.startTime.toISOString(),
      endIso: p.endTime.toISOString(),
    }));

    // ── Compute daily brief data ─────────────────────────────────────────────
    const eventCount = calendarEvents.filter((e) => !e.isAllDay).length;

    // Meeting hours
    const meetingMs = calendarEvents
      .filter((e) => !e.isAllDay)
      .reduce((sum, e) => sum + (new Date(e.endIso).getTime() - new Date(e.startIso).getTime()), 0);
    const meetingHours = Math.round((meetingMs / 3_600_000) * 10) / 10;

    // Next upcoming event
    let nextEvent: DailyBriefData['nextEvent'] = null;
    const upcomingEvents = calendarEvents
      .filter((e) => !e.isAllDay && new Date(e.startIso).getTime() > now.getTime() - 3_600_000)
      .sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime());
    if (upcomingEvents.length > 0) {
      const next = upcomingEvents[0];
      const startDate = new Date(next.startIso);
      nextEvent = {
        title: next.title,
        startTime: toHHmm(startDate, timezone),
        minutesUntil: Math.round((startDate.getTime() - now.getTime()) / 60_000),
      };
    }

    // Best focus window — reuse existing detectFocusWindows
    const focusWindows = detectFocusWindows({
      events: calendarEvents,
      rangeStartIso: todayStart.toISOString(),
      rangeEndIso: todayEnd.toISOString(),
      timezone,
      minFocusWindowMinutes: 30,
      plannedItems,
    });
    const bestFocusWindow: DailyBriefData['bestFocusWindow'] = focusWindows.length > 0
      ? {
          startTime: toHHmm(new Date(focusWindows[0].start), timezone),
          endTime: toHHmm(new Date(focusWindows[0].end), timezone),
          durationMinutes: focusWindows[0].durationMinutes,
        }
      : null;

    // Top priority task (priority order: high > medium > low)
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sortedTasks = [...taskRows].sort(
      (a, b) =>
        priorityOrder[a.priority as keyof typeof priorityOrder] -
        priorityOrder[b.priority as keyof typeof priorityOrder],
    );
    const topPriorityTask: DailyBriefData['topPriorityTask'] = sortedTasks.length > 0
      ? {
          id: sortedTasks[0].id,
          title: sortedTasks[0].title,
          priority: sortedTasks[0].priority as 'high' | 'medium' | 'low',
          dueDate: sortedTasks[0].dueDate
            ? sortedTasks[0].dueDate.toISOString().slice(0, 10)
            : null,
          estimatedMinutes: sortedTasks[0].estimatedMinutes,
        }
      : null;

    // Overdue tasks
    const overdueCount = taskRows.filter(
      (t) => t.dueDate && new Date(t.dueDate) < todayStart,
    ).length;

    const totalOpenTasks = taskRows.length;
    const plannedTaskCount = plannerRows.length;

    // Streak
    const currentStreak = userRow?.dailyStreak ?? 0;
    // The user's local hour, read through their zone rather than off a Date
    // that was already mangled into the server's.
    const currentHour = Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        hour12: false,
        timeZone: timezone,
      }).format(now),
    );
    const hadFocusToday = userRow?.lastFocusDate === todayStr;
    const isStreakAtRisk = !hadFocusToday && currentHour >= 18;

    // ── Gemini narrative (cached) ────────────────────────────────────────────
    let narrative = 'Have a productive day.';
    let narrativeGeneratedAt = now.toISOString();

    if (cachedBrief && !forceRefresh) {
      narrative = cachedBrief.narrative;
      narrativeGeneratedAt = cachedBrief.generatedAt.toISOString();
    } else {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey });
          const userName = userRow?.name ?? 'there';
          const timeOfDay = getGreetingTimeOfDay(timezone);
          const dayOfWeek = getDayOfWeek(todayStr);

          const prompt = `You are a personal productivity assistant writing a morning brief for a knowledge worker. Be direct, warm, and specific. Never be generic. Never say "Great job" or "You've got this." Write exactly 2 sentences. No more. Reference specific details.

User context:
Name: ${userName}
Today: ${dayOfWeek}, ${todayStr}
Events today: ${eventCount} (${meetingHours}h in meetings)
Next event: ${nextEvent ? `${nextEvent.title} at ${nextEvent.startTime}` : 'None'}
Best focus window: ${bestFocusWindow ? `${bestFocusWindow.startTime}–${bestFocusWindow.endTime} (${bestFocusWindow.durationMinutes}min)` : 'No free blocks today'}
Top priority task: ${topPriorityTask ? `"${topPriorityTask.title}" (${topPriorityTask.priority}, est. ${topPriorityTask.estimatedMinutes}min)` : 'None'}
Overdue tasks: ${overdueCount}
Current streak: ${currentStreak} days
Time of day: ${timeOfDay}

Write 2 sentences that:
1. Acknowledge the shape of their day specifically
2. Give one clear recommendation for what to focus on first`;

          const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: { maxOutputTokens: 200, temperature: 0.7 },
          });

          const text = result.text?.trim();
          if (text && text.length > 10) {
            narrative = text;
          }
        } catch (err) {
          logger.error('Gemini narrative failed', { route: 'GET /api/daily-brief' }, err);
        }

        // Cache to DB (upsert via ON CONFLICT)
        narrativeGeneratedAt = new Date().toISOString();
        try {
          await db
            .insert(dailyBriefCache)
            .values({
              userId,
              date: todayStr,
              narrative,
              generatedAt: new Date(narrativeGeneratedAt),
            })
            .onConflictDoUpdate({
              target: [dailyBriefCache.userId, dailyBriefCache.date],
              set: {
                narrative,
                generatedAt: new Date(narrativeGeneratedAt),
              },
            });
        } catch (cacheErr) {
          logger.error('Cache write failed', { route: 'GET /api/daily-brief' }, cacheErr);
        }
      }
    }

    const brief: DailyBriefData = {
      date: todayStr,
      eventCount,
      nextEvent,
      meetingHours,
      bestFocusWindow,
      topPriorityTask,
      overdueCount,
      totalOpenTasks,
      plannedTaskCount,
      currentStreak,
      isStreakAtRisk,
      narrative,
      narrativeGeneratedAt,
    };

    return NextResponse.json(brief);
  } catch (err) {
    return apiError('GET /api/daily-brief', err);
  }
}
