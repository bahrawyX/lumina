import { getDatabase } from '@/lib/db';
import { users } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';

/**
 * H4: atomically spend one streak shield. The decrement runs on the LIVE JSON
 * column with a `streakShield > 0` guard — Postgres row-locks and re-evaluates
 * the WHERE, so two concurrent recoveries can't both spend the same shield, and
 * there is no whole-object overwrite to clobber a concurrent consumable change.
 *
 * Returns `{ spent: false }` when no shield was available (or the caller lost the
 * race). On success `restoredStreak` + `lastFocusDate` are applied in the same
 * guarded UPDATE.
 */
export async function spendStreakShield(
  userId: string,
  restoredStreak: number,
  todayIso: string,
): Promise<{ spent: boolean; remaining: number }> {
  const db = getDatabase();
  const updated = await db
    .update(users)
    .set({
      consumables: sql`jsonb_set(coalesce(${users.consumables}, '{}'::jsonb), '{streakShield}', to_jsonb(greatest(0, coalesce((${users.consumables}->>'streakShield')::int, 0) - 1)))`,
      dailyStreak: restoredStreak,
      lastFocusDate: todayIso,
      updatedAt: new Date(),
    })
    .where(and(eq(users.id, userId), sql`coalesce((${users.consumables}->>'streakShield')::int, 0) > 0`))
    .returning({ consumables: users.consumables });

  if (updated.length === 0) return { spent: false, remaining: 0 };
  const remaining = ((updated[0].consumables as Record<string, number>)?.streakShield) ?? 0;
  return { spent: true, remaining };
}
