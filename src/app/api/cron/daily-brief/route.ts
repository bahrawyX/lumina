import { NextResponse } from 'next/server';
import { sql, and, gte, lte } from 'drizzle-orm';
import { verifyCronSecret } from '@/lib/cronAuth';
import { getDatabase } from '@/lib/db';
import { users, pushSubscriptions, events, tasks } from '@/db/schema';
import { sendPushToUser } from '@/lib/push/sendPushNotification';

export const dynamic = 'force-dynamic';

/**
 * Returns the current hour and minute in a given IANA timezone.
 * Uses the Intl API — no external libraries needed.
 */
function getLocalTime(tz: string): { hour: number; minute: number } {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(now);

    let hour = 0;
    let minute = 0;
    for (const p of parts) {
      if (p.type === 'hour') hour = parseInt(p.value, 10);
      if (p.type === 'minute') minute = parseInt(p.value, 10);
    }
    // Intl hour12:false returns 24 for midnight in some locales
    if (hour === 24) hour = 0;
    return { hour, minute };
  } catch {
    // Invalid timezone — return -1 so the check fails gracefully
    return { hour: -1, minute: -1 };
  }
}

// Runs every 5 minutes — checks which users have local time ~8:00 AM
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDatabase();
  const now = new Date();

  // Get all users with push subscriptions
  const eligibleUsers = await db
    .selectDistinct({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions);

  if (eligibleUsers.length === 0) {
    return NextResponse.json({ sent: 0, reason: 'no subscribers' });
  }

  let sentCount = 0;

  for (const { userId } of eligibleUsers) {
    try {
      const [user] = await db
        .select({
          id: users.id,
          name: users.name,
          timezone: users.timezone,
          notificationPreferences: users.notificationPreferences,
        })
        .from(users)
        .where(sql`${users.id} = ${userId}`)
        .limit(1);

      if (!user) continue;

      const prefs = user.notificationPreferences as { dailyBrief?: boolean; taskReminders?: boolean } | null;
      if (!prefs?.dailyBrief) continue;

      // Check if user's LOCAL time is between 8:00 and 8:04
      const userTz = user.timezone || 'UTC';
      const { hour, minute } = getLocalTime(userTz);
      if (hour !== 8 || minute >= 5) continue;

      // Get today's events count (in user's local date)
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setUTCHours(23, 59, 59, 999);

      const todayEvents = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            sql`${events.userId} = ${userId}`,
            gte(events.startTime, todayStart),
            lte(events.startTime, todayEnd),
          ),
        );

      // Get tasks due today
      const todayDateStr = now.toISOString().slice(0, 10);
      const dueTasks = await db
        .select({ id: tasks.id, title: tasks.title })
        .from(tasks)
        .where(
          and(
            sql`${tasks.userId} = ${userId}`,
            sql`${tasks.dueDate} = ${todayDateStr}`,
            sql`${tasks.status} != 'done'`,
          ),
        );

      const eventCount = todayEvents.length;
      const name = user.name?.split(' ')[0] ?? 'there';

      // Send daily brief notification
      await sendPushToUser(userId, {
        title: `Good morning, ${name}`,
        body: `${eventCount} meeting${eventCount !== 1 ? 's' : ''} today${dueTasks.length > 0 ? ` \u00b7 ${dueTasks.length} task${dueTasks.length !== 1 ? 's' : ''} due` : ''}`,
        tag: 'daily-brief',
        url: '/',
        notificationType: 'daily_brief',
        actions: [
          { action: 'view_plan', title: 'View Plan' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
      });

      // Send separate task due notification if enabled
      if (prefs.taskReminders && dueTasks.length > 0) {
        const topTask = dueTasks[0];
        const othersCount = dueTasks.length - 1;
        await sendPushToUser(userId, {
          title: `${dueTasks.length} task${dueTasks.length !== 1 ? 's' : ''} due today`,
          body: othersCount > 0
            ? `${topTask.title} and ${othersCount} other${othersCount !== 1 ? 's' : ''}`
            : topTask.title,
          tag: 'tasks-due',
          url: '/tasks',
          notificationType: 'task_due',
        });
      }

      sentCount++;
    } catch (err) {
      console.error(`[Cron:daily-brief] Error for user ${userId}:`, err);
    }
  }

  return NextResponse.json({ sent: sentCount });
}
