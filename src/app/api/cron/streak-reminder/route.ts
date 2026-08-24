import { NextResponse } from 'next/server';
import { eq, gt } from 'drizzle-orm';
import { verifyCronSecret } from '@/lib/cronAuth';
import { getDatabase } from '@/lib/db';
import { users, pushSubscriptions } from '@/db/schema';
import { sendPushToUser } from '@/lib/push/sendPushNotification';
import { mapWithConcurrency } from '@/lib/integrations/mapWithConcurrency';
import { claimNotification, isLocalHour, releaseClaim } from '@/lib/notifications/claim';
import { zonedToday } from '@/lib/time/zonedTime';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/** See daily-brief: Vercel's default is 10s and this loops every subscriber. */
export const maxDuration = 60;

/**
 * The local hour at which the "your streak is at risk" nudge fires.
 *
 * P1-2: this ran at `0 20 * * *` UTC — described as "before midnight", which it
 * is only for users near UTC. In Tokyo that lands at **05:00 the next day**,
 * after the streak is already lost. The cron now runs hourly and each user is
 * picked up at 20:00 *their* time, which is what the schedule always meant.
 */
const REMINDER_LOCAL_HOUR = 20;

const SEND_CONCURRENCY = 8;
const MAX_USERS_PER_RUN = 500;

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDatabase();
  const now = new Date();

  // One joined query. This was "select distinct subscribers" followed by a
  // separate SELECT per user inside a sequential loop.
  const candidates = await db
    .selectDistinct({
      id: users.id,
      timezone: users.timezone,
      dailyStreak: users.dailyStreak,
      lastFocusDate: users.lastFocusDate,
      notificationPreferences: users.notificationPreferences,
    })
    .from(users)
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, users.id))
    .where(gt(users.dailyStreak, 0))
    .limit(MAX_USERS_PER_RUN);

  const dueNow = candidates.filter((u) => {
    const prefs = u.notificationPreferences as { streakReminder?: boolean } | null;
    if (!prefs?.streakReminder) return false;

    const tz = u.timezone || 'UTC';
    if (!isLocalHour(tz, REMINDER_LOCAL_HOUR, now)) return false;

    // Already focused today, in the user's own timezone — nothing at risk.
    // Previously compared against a UTC date string, so a user west of
    // Greenwich who focused in their evening was told their streak was at risk.
    const lastFocus = u.lastFocusDate?.toString().slice(0, 10);
    return lastFocus !== zonedToday(tz, now);
  });

  if (dueNow.length === 0) {
    return NextResponse.json({ sent: 0, considered: candidates.length });
  }

  let sentCount = 0;
  let skippedAlreadySent = 0;

  await mapWithConcurrency(dueNow, SEND_CONCURRENCY, async (user) => {
    const tz = user.timezone || 'UTC';

    // P1-2: claim before sending. Without it, a retry re-nudged everyone.
    if (!(await claimNotification(user.id, 'streak_reminder', tz, now))) {
      skippedAlreadySent++;
      return;
    }

    try {
      await sendPushToUser(user.id, {
        title: 'Your streak is at risk',
        body: `${user.dailyStreak}-day streak · Log a focus session before midnight`,
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
      await releaseClaim(user.id, 'streak_reminder', tz, now).catch(() => {});
      logger.error('streak reminder failed for user', {
        route: 'GET /api/cron/streak-reminder',
        userId: user.id,
      }, err);
    }
  });

  return NextResponse.json({
    sent: sentCount,
    considered: candidates.length,
    dueNow: dueNow.length,
    skippedAlreadySent,
    truncated: candidates.length >= MAX_USERS_PER_RUN,
  });
}
