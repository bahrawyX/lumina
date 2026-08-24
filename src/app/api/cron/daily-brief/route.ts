import { NextResponse } from 'next/server';
import { and, eq, gte, lt, ne } from 'drizzle-orm';
import { verifyCronSecret } from '@/lib/cronAuth';
import { getDatabase } from '@/lib/db';
import { users, pushSubscriptions, events, tasks } from '@/db/schema';
import { sendPushToUser } from '@/lib/push/sendPushNotification';
import { mapWithConcurrency } from '@/lib/integrations/mapWithConcurrency';
import { claimNotification, isLocalHour, releaseClaim } from '@/lib/notifications/claim';
import { zonedDayBounds, zonedToday } from '@/lib/time/zonedTime';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * P1-2: there was NO `maxDuration` on any cron route — `grep -rn maxDuration
 * src/app` found it only on the five sync routes. Vercel's default is 10s, and
 * this looped every push subscriber **sequentially** issuing 3 DB round-trips
 * plus a push send per user. At ~150 ms/user that died at roughly 60 users,
 * having notified an arbitrary prefix of the list — and because failures are
 * per-user catch-and-continue, the timeout was completely silent.
 */
export const maxDuration = 60;

/** The local hour at which a user receives their brief. */
const BRIEF_LOCAL_HOUR = 8;

/**
 * How many users are notified in parallel.
 *
 * `mapWithConcurrency` already existed and was tested; it was wired only to two
 * functions whose own doc comments declare them "INTENTIONAL NO-OP".
 */
const SEND_CONCURRENCY = 8;

/** Belt-and-braces ceiling per invocation, so one run cannot overrun. */
const MAX_USERS_PER_RUN = 500;

/** Time-of-day greeting from the user's own local hour. */
function getGreeting(tz: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(now);

    let hour = 0;
    for (const p of parts) {
      if (p.type === 'hour') hour = parseInt(p.value, 10);
    }
    if (hour === 24) hour = 0;

    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  } catch {
    return 'Good morning';
  }
}

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDatabase();
  const now = new Date();

  // P1-2: one joined query instead of "select distinct subscribers, then a
  // separate SELECT per user". Previously 1 + N round-trips before any send.
  const candidates = await db
    .selectDistinct({
      id: users.id,
      name: users.name,
      timezone: users.timezone,
      notificationPreferences: users.notificationPreferences,
    })
    .from(users)
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, users.id))
    .limit(MAX_USERS_PER_RUN);

  // P1-2: the cron ran at a fixed `0 8 * * *` UTC while `getGreeting(userTz)`
  // computed a label from the user's timezone — so a Tokyo user got their
  // "morning brief" at 17:00 local, correctly greeted "Good evening". It now
  // runs HOURLY and each user is picked up in the hour that is 08:00 for them.
  const dueNow = candidates.filter((u) => {
    const prefs = u.notificationPreferences as { dailyBrief?: boolean } | null;
    if (!prefs?.dailyBrief) return false;
    return isLocalHour(u.timezone || 'UTC', BRIEF_LOCAL_HOUR, now);
  });

  if (dueNow.length === 0) {
    return NextResponse.json({ sent: 0, considered: candidates.length });
  }

  let sentCount = 0;
  let skippedAlreadySent = 0;

  await mapWithConcurrency(dueNow, SEND_CONCURRENCY, async (user) => {
    const userTz = user.timezone || 'UTC';
    const prefs = user.notificationPreferences as {
      dailyBrief?: boolean;
      taskReminders?: boolean;
    } | null;

    // P1-2: claim BEFORE sending. Without this, a Vercel retry or a re-run
    // after a partial timeout re-sent to everyone. `tag: 'daily-brief'` only
    // collapses the display on-device — the push is still sent and still costs
    // quota.
    if (!(await claimNotification(user.id, 'daily_brief', userTz, now))) {
      skippedAlreadySent++;
      return;
    }

    try {
      // P2-8: day bounds come from the USER'S timezone, not the UTC runtime's.
      const bounds = zonedDayBounds(zonedToday(userTz, now), userTz);
      if (!bounds) return;

      const todayEvents = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.userId, user.id),
            gte(events.startTime, bounds.start),
            lt(events.startTime, bounds.end),
          ),
        );

      // P2-8: `tasks.due_date` is a timestamptz and was compared against a bare
      // date string, so only tasks due at exactly UTC midnight matched — any
      // task created with a full ISO timestamp was invisible to this
      // notification. Range-compare against the user's local day instead.
      const dueTasks = await db
        .select({ id: tasks.id, title: tasks.title })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, user.id),
            gte(tasks.dueDate, bounds.start),
            lt(tasks.dueDate, bounds.end),
            ne(tasks.status, 'done'),
          ),
        );

      const eventCount = todayEvents.length;
      const name = user.name?.split(' ')[0] ?? 'there';
      const greeting = getGreeting(userTz, now);

      await sendPushToUser(user.id, {
        title: `${greeting}, ${name}`,
        body: `${eventCount} meeting${eventCount !== 1 ? 's' : ''} today${
          dueTasks.length > 0
            ? ` · ${dueTasks.length} task${dueTasks.length !== 1 ? 's' : ''} due`
            : ''
        }`,
        tag: 'daily-brief',
        url: '/',
        notificationType: 'daily_brief',
        actions: [
          { action: 'view_plan', title: 'View Plan' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
      });

      // Separately claimed: a user may have the brief on and task reminders
      // off, and a failure of one must not suppress the other tomorrow.
      if (prefs?.taskReminders && dueTasks.length > 0) {
        if (await claimNotification(user.id, 'tasks_due', userTz, now)) {
          const topTask = dueTasks[0];
          const othersCount = dueTasks.length - 1;
          await sendPushToUser(user.id, {
            title: `${dueTasks.length} task${dueTasks.length !== 1 ? 's' : ''} due today`,
            body:
              othersCount > 0
                ? `${topTask.title} and ${othersCount} other${othersCount !== 1 ? 's' : ''}`
                : topTask.title,
            tag: 'tasks-due',
            url: '/tasks',
            notificationType: 'task_due',
          });
        }
      }

      sentCount++;
    } catch (err) {
      // Hand the claim back so the next hourly run retries, mirroring what the
      // event-reminder cron does on a failed push.
      await releaseClaim(user.id, 'daily_brief', userTz, now).catch(() => {});
      logger.error('daily brief failed for user', {
        route: 'GET /api/cron/daily-brief',
        userId: user.id,
      }, err);
    }
  });

  return NextResponse.json({
    sent: sentCount,
    considered: candidates.length,
    dueNow: dueNow.length,
    skippedAlreadySent,
    // A run that hits the ceiling is visible rather than silently partial.
    truncated: candidates.length >= MAX_USERS_PER_RUN,
  });
}
