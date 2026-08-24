import 'server-only';

import { and, eq, lt, sql } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { notificationSends } from '@/db/schema';
import { zonedToday } from '@/lib/time/zonedTime';

/**
 * At-most-once claiming for scheduled notifications.
 *
 * `event-reminders` already had this — an atomic
 * `UPDATE ... WHERE reminder_sent_at IS NULL RETURNING` claim, with a
 * regression test. `daily-brief` and `streak-reminder` had nothing, so a Vercel
 * retry or a re-run after a partial timeout re-sent to everyone.
 *
 * `tag: 'daily-brief'` is not a substitute: it collapses the *display*
 * on-device, but the push is still sent and still costs quota.
 */

export type NotificationKind = 'daily_brief' | 'tasks_due' | 'streak_reminder';

/**
 * Try to claim `kind` for `userId` on their local date.
 *
 * Returns true to **exactly one** caller per (user, kind, local day), however
 * many run concurrently — the unique index does the arbitration, not a
 * read-then-write.
 *
 * Claiming happens BEFORE the send. If the send then fails, `releaseClaim`
 * hands it back so the next run retries; that mirrors what the event-reminder
 * cron does on a failed push.
 */
export async function claimNotification(
  userId: string,
  kind: NotificationKind,
  timeZone: string,
  now: Date = new Date(),
): Promise<boolean> {
  const db = getDatabase();
  if (!db) return false;

  const localDate = zonedToday(timeZone, now);

  const claimed = await db
    .insert(notificationSends)
    .values({ userId, kind, localDate })
    .onConflictDoNothing({
      target: [
        notificationSends.userId,
        notificationSends.kind,
        notificationSends.localDate,
      ],
    })
    .returning({ id: notificationSends.id });

  return claimed.length > 0;
}

/** Hand a claim back after a failed send, so the next run may retry. */
export async function releaseClaim(
  userId: string,
  kind: NotificationKind,
  timeZone: string,
  now: Date = new Date(),
): Promise<void> {
  const db = getDatabase();
  if (!db) return;

  const localDate = zonedToday(timeZone, now);
  await db
    .delete(notificationSends)
    .where(
      and(
        eq(notificationSends.userId, userId),
        eq(notificationSends.kind, kind),
        eq(notificationSends.localDate, localDate),
      ),
    );
}

/**
 * Delete claims older than `days`.
 *
 * The table grows by (users x kinds) every day and nothing reads a row past its
 * own day, so this is pure housekeeping — a missed sweep costs storage, never
 * correctness.
 */
export async function sweepOldNotificationSends(days = 30): Promise<number> {
  const db = getDatabase();
  if (!db) return 0;

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(notificationSends)
    .where(lt(notificationSends.sentAt, cutoff))
    .returning({ id: notificationSends.id });
  return deleted.length;
}

/**
 * True when it is `targetHour` o'clock in `timeZone`.
 *
 * P1-2: all three crons ran at fixed UTC hours while `getGreeting(userTz)`
 * computed a *label* from the user's timezone — so a Tokyo user received their
 * "morning brief" at 17:00 local, correctly greeted **"Good evening"**. The
 * greeting code proves the timezone was considered and then not acted on.
 *
 * The crons now run hourly and each user is picked up in the hour that is
 * `targetHour` for them.
 */
export function isLocalHour(timeZone: string, targetHour: number, now: Date = new Date()): boolean {
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: '2-digit',
        hour12: false,
      }).format(now),
    );
    return hour % 24 === targetHour;
  } catch {
    // An unusable zone falls back to UTC rather than never notifying.
    return now.getUTCHours() === targetHour;
  }
}

/** Marker so a hand-written SQL sweep can find the table. */
export const NOTIFICATION_SENDS_TABLE = sql`notification_sends`;
