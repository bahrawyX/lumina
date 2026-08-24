import { NextResponse } from 'next/server';
import { sql, and, gte, lte } from 'drizzle-orm';
import { verifyCronSecret } from '@/lib/cronAuth';
import { getDatabase } from '@/lib/db';
import { users, pushSubscriptions, events, tasks } from '@/db/schema';
import { sendPushToUser } from '@/lib/push/sendPushNotification';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// NOTE: Vercel Hobby plan — runs once per day (8 AM UTC)
// Upgrade to Pro for per-minute precision

/**
 * Returns time-of-day greeting based on user's local hour.
 */
function getGreeting(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date());

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

/**
 * Returns today's date string (YYYY-MM-DD) in UTC.
 */
function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDatabase();
  const now = new Date();
  const todayDateStr = getTodayUTC();

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

      const userTz = user.timezone || 'UTC';

      // Get today's events count
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
      const greeting = getGreeting(userTz);

      // Send daily brief notification
      await sendPushToUser(userId, {
        title: `${greeting}, ${name}`,
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
      logger.error('Error for user ${userId}', { route: `Cron:daily-brief` }, err);
    }
  }

  return NextResponse.json({ sent: sentCount });
}
