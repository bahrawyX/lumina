import { NextResponse } from 'next/server';
import { and, gt, sql } from 'drizzle-orm';
import { verifyCronSecret } from '@/lib/cronAuth';
import { getDatabase } from '@/lib/db';
import { users, pushSubscriptions } from '@/db/schema';
import { sendPushToUser } from '@/lib/push/sendPushNotification';

export const dynamic = 'force-dynamic';

/**
 * Returns the current hour and minute in a given IANA timezone.
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
    if (hour === 24) hour = 0;
    return { hour, minute };
  } catch {
    return { hour: -1, minute: -1 };
  }
}

/**
 * Returns today's date string (YYYY-MM-DD) in the user's local timezone.
 */
function getLocalDateStr(tz: string): string {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).formatToParts(now);
    // en-CA formats as YYYY-MM-DD
    return parts.map((p) => p.value).join('');
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// Runs every 5 minutes — sends streak risk notifications at ~8 PM local time
// for users who have an active streak but haven't focused today
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDatabase();

  const eligibleUsers = await db
    .selectDistinct({
      userId: pushSubscriptions.userId,
    })
    .from(pushSubscriptions);

  if (eligibleUsers.length === 0) {
    return NextResponse.json({ sent: 0, reason: 'no subscribers' });
  }

  let sentCount = 0;

  for (const { userId } of eligibleUsers) {
    try {
      const [user] = await db
        .select({
          dailyStreak: users.dailyStreak,
          lastFocusDate: users.lastFocusDate,
          timezone: users.timezone,
          notificationPreferences: users.notificationPreferences,
        })
        .from(users)
        .where(
          and(
            sql`${users.id} = ${userId}`,
            gt(users.dailyStreak, 0),
          ),
        )
        .limit(1);

      if (!user) continue;

      const prefs = user.notificationPreferences as { streakReminder?: boolean } | null;
      if (!prefs?.streakReminder) continue;

      // Check if user's LOCAL time is 8 PM (20:00–20:04)
      const userTz = user.timezone || 'UTC';
      const { hour, minute } = getLocalTime(userTz);
      if (hour !== 20 || minute >= 5) continue;

      // Skip if user already focused today (in their local date)
      const todayStr = getLocalDateStr(userTz);
      const lastFocusStr = user.lastFocusDate?.toString().slice(0, 10);
      if (lastFocusStr === todayStr) continue;

      await sendPushToUser(userId, {
        title: 'Your streak is at risk',
        body: `${user.dailyStreak}-day streak \u00b7 Log a focus session before midnight`,
        tag: 'streak-risk',
        url: '/focus',
        notificationType: 'streak_risk',
        requireInteraction: true,
        actions: [
          { action: 'start_focus', title: 'Start Session' },
          { action: 'dismiss', title: 'Later' },
        ],
      });

      sentCount++;
    } catch (err) {
      console.error(`[Cron:streak-reminder] Error for user ${userId}:`, err);
    }
  }

  return NextResponse.json({ sent: sentCount });
}
