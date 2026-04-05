import { NextResponse } from 'next/server';
import { and, gte, lte, isNull, sql } from 'drizzle-orm';
import { verifyCronSecret } from '@/lib/cronAuth';
import { getDatabase } from '@/lib/db';
import { events, users } from '@/db/schema';
import { sendPushToUser } from '@/lib/push/sendPushNotification';

export const dynamic = 'force-dynamic';

// Runs every 5 minutes — sends reminders for events starting in 10-15 minutes
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDatabase();
  const now = new Date();
  const in10Min = new Date(now.getTime() + 10 * 60 * 1000);
  const in15Min = new Date(now.getTime() + 15 * 60 * 1000);

  // Find events starting in 10-15 minutes that haven't been reminded yet
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
        gte(events.startTime, in10Min),
        lte(events.startTime, in15Min),
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
      // Check user's notification preferences
      const [user] = await db
        .select({ notificationPreferences: users.notificationPreferences })
        .from(users)
        .where(sql`${users.id} = ${event.userId}`)
        .limit(1);

      const prefs = user?.notificationPreferences as { eventReminders?: boolean } | null;
      if (!prefs?.eventReminders) continue;

      const locationText = event.location ? `· ${event.location}` : '· No location';

      await sendPushToUser(event.userId, {
        title: event.title,
        body: `Starting in 10 minutes ${locationText}`,
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
