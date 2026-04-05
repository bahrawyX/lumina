import { NextResponse } from 'next/server';
import { and, gte, lte, isNull, sql } from 'drizzle-orm';
import { verifyCronSecret } from '@/lib/cronAuth';
import { getDatabase } from '@/lib/db';
import { events, users } from '@/db/schema';
import { sendPushToUser } from '@/lib/push/sendPushNotification';

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

  const upcomingEvents = await db
    .select({
      id: events.id,
      title: events.title,
      location: events.location,
      userId: events.userId,
      startTime: events.startTime,
    })
    .from(events)
    .where(
      and(
        gte(events.startTime, in1Hour),
        lte(events.startTime, in24Hours),
        isNull(events.reminderSentAt),
        sql`${events.isAllDay} = false`,
      ),
    );

  if (upcomingEvents.length === 0) {
    return NextResponse.json({ sent: 0, reason: 'no upcoming events' });
  }

  let sentCount = 0;

  for (const event of upcomingEvents) {
    try {
      // Check user's notification preferences and get timezone
      const [user] = await db
        .select({
          notificationPreferences: users.notificationPreferences,
          timezone: users.timezone,
        })
        .from(users)
        .where(sql`${users.id} = ${event.userId}`)
        .limit(1);

      const prefs = user?.notificationPreferences as { eventReminders?: boolean } | null;
      if (!prefs?.eventReminders) continue;

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

      // Mark as reminded
      await db
        .update(events)
        .set({ reminderSentAt: new Date() })
        .where(sql`${events.id} = ${event.id}`);

      sentCount++;
    } catch (err) {
      console.error(`[Cron:event-reminders] Error for event ${event.id}:`, err);
    }
  }

  return NextResponse.json({ sent: sentCount });
}
