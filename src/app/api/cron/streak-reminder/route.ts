import { NextResponse } from 'next/server';
import { and, gt, sql } from 'drizzle-orm';
import { verifyCronSecret } from '@/lib/cronAuth';
import { getDatabase } from '@/lib/db';
import { users, pushSubscriptions } from '@/db/schema';
import { sendPushToUser } from '@/lib/push/sendPushNotification';

export const dynamic = 'force-dynamic';

// NOTE: Vercel Hobby plan — runs once per day (8 PM UTC)
// Upgrade to Pro for per-minute precision

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
  const todayStr = getTodayUTC();

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

      // Skip if user already focused today
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
