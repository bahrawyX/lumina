import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { verifyCronSecret } from '@/lib/cronAuth';
import { getDatabase } from '@/lib/db';
import { events, users } from '@/db/schema';
import { sendPushToUser } from '@/lib/push/sendPushNotification';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/** P1-2: no cron route declared this; Vercel's default is 10s. */
export const maxDuration = 60;

/**
 * Ceiling on reminders claimed per run.
 *
 * The claiming UPDATE has no `user_id` predicate and every `events` index is
 * `(user_id, …)`-leading, so it was a **full sequential scan of the entire
 * events table, taking row locks as it went**. `events_reminder_due_idx`
 * (migration 0023) is a partial index on `(start_time) WHERE reminder_sent_at
 * IS NULL AND is_all_day = false` — exactly this query — and the LIMIT bounds
 * the lock set even if the plan ever changes.
 */
const MAX_REMINDERS_PER_RUN = 500;

/**
 * Formats a Date into a human-readable local time string for the user.
 * e.g. "9:30 AM", "2:00 PM"
 */
function formatEventTime(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDatabase();
  const now = new Date();

  // P1-2: the window was [now+1h, now+24h] while the cron fired ONCE daily at
  // 09:00 UTC — so an event starting between 09:00 and 10:00 UTC fell outside
  // yesterday's window and outside today's, and was **never** reminded. That is
  // a permanent one-hour blind spot, every day.
  //
  // The window now starts at `now` and extends past 24h, and the cron runs
  // hourly, so consecutive runs overlap rather than leaving a gap. The atomic
  // claim below makes overlap free: a reminder already claimed is simply not
  // re-selected.
  const windowStart = now;
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  // ATOMIC CLAIM (M4): mark every due, unsent reminder in a single UPDATE and take
  // only the rows THIS run actually claimed (reminder_sent_at was NULL). Because
  // the claim and the "is it unsent?" test happen in one atomic statement, two
  // overlapping or retried cron runs can never claim the same row — so a reminder
  // is never double-sent. (Replaces the previous select→send→mark, which raced:
  // both runs could select the same unsent row before either marked it.)
  const claimed = await db
    .update(events)
    .set({ reminderSentAt: now })
    .where(
      // The predicate is expressed as a bounded sub-select rather than inline,
      // because Drizzle's `update()` has no `.limit()` and an unbounded claim
      // locks every matching row in one statement.
      sql`${events.id} in (
        select e.id from ${events} e
        where e.start_time >= ${windowStart}
          and e.start_time <= ${windowEnd}
          and e.reminder_sent_at is null
          and e.is_all_day = false
        order by e.start_time
        limit ${MAX_REMINDERS_PER_RUN}
      )`,
    )
    .returning({
      id: events.id,
      title: events.title,
      location: events.location,
      userId: events.userId,
      startTime: events.startTime,
    });

  // Reported so a run that hits the ceiling is visible rather than silently
  // partial — the failure mode the audit called out for all three crons.
  const truncated = claimed.length >= MAX_REMINDERS_PER_RUN;

  if (claimed.length === 0) {
    return NextResponse.json({ sent: 0, reason: 'no upcoming events' });
  }

  let sentCount = 0;

  for (const event of claimed) {
    try {
      // Check user's notification preferences and get timezone
      const [user] = await db
        .select({
          notificationPreferences: users.notificationPreferences,
          timezone: users.timezone,
        })
        .from(users)
        .where(eq(users.id, event.userId))
        .limit(1);

      const prefs = user?.notificationPreferences as { eventReminders?: boolean } | null;
      if (!prefs?.eventReminders) {
        // Opted out — release the claim so the row isn't left marked-sent without
        // an actual send (and can be re-evaluated if prefs change while in-window).
        await db
          .update(events)
          .set({ reminderSentAt: null })
          .where(eq(events.id, event.id));
        continue;
      }

      // `event.startTime` is a true instant, so formatting it in the user's zone
      // is a single, correct conversion.
      //
      // This line used to be a DOUBLE shift: storage held floating wall-clock
      // coerced to UTC, and this re-converted that already-local value into the
      // user's timezone on top. A UTC-5 user's 3pm meeting was treated as 10am
      // and announced at the wrong time. Fixing the storage model (P0-6) is
      // what makes this correct; the code here did not need to change.
      const userTz = user?.timezone || 'UTC';
      const timeStr = formatEventTime(event.startTime, userTz);
      const locationText = event.location ? ` · ${event.location}` : '';

      await sendPushToUser(event.userId, {
        title: event.title,
        body: `Today at ${timeStr}${locationText}`,
        tag: `event-reminder-${event.id}`,
        url: '/',
        notificationType: 'event_reminder',
        renotify: false,
      });

      sentCount++;
    } catch (err) {
      logger.error('Error for event ${event.id}', { route: `Cron:event-reminders` }, err);
      // Release the claim so a genuine send failure is retried next run (mirrors
      // the pre-fix behavior, where a failed send was never marked as sent).
      await db
        .update(events)
        .set({ reminderSentAt: null })
        .where(eq(events.id, event.id));
    }
  }

  return NextResponse.json({ sent: sentCount, claimed: claimed.length, truncated });
}
