import { NextResponse } from 'next/server';
import { and, eq, gte, lte, isNull, sql } from 'drizzle-orm';
import { verifyCronSecret } from '@/lib/cronAuth';
import { getDatabase } from '@/lib/db';
import { events, users } from '@/db/schema';
import { sendPushToUser } from '@/lib/push/sendPushNotification';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// NOTE: Vercel Hobby plan — runs once per day (9 AM UTC)
// Upgrade to Pro for per-minute precision (10-min-before reminders)

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

  // Query events starting in the next 1–24 hours that haven't been reminded
  const in1Hour = new Date(now.getTime() + 1 * 60 * 60 * 1000);
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

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
      and(
        gte(events.startTime, in1Hour),
        lte(events.startTime, in24Hours),
        isNull(events.reminderSentAt),
        sql`${events.isAllDay} = false`,
      ),
    )
    .returning({
      id: events.id,
      title: events.title,
      location: events.location,
      userId: events.userId,
      startTime: events.startTime,
    });

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

  return NextResponse.json({ sent: sentCount });
}
