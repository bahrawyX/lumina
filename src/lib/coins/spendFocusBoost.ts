import { getDatabase } from '@/lib/db';
import { users } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';

/**
 * Atomically claim one 2x Focus Boost.
 *
 * The same shape as `spendStreakShield` (H4), and for the same reason. The
 * focus-session route used to do this instead:
 *
 *     const [uc] = await db.select({ consumables: users.consumables })…
 *     const hasFocusBoost = (uc?.consumables?.focusBoost ?? 0) > 0;
 *     …award, doubled when hasFocusBoost…
 *     if (hasFocusBoost && focusRes.awarded) {
 *       await db.update(users).set({ …focusBoost - 1… });
 *     }
 *
 * Read, then decide, then decrement — with nothing holding the row in between.
 * Two sessions finishing together both read `focusBoost: 1`, both doubled their
 * award, and both decremented; `greatest(0, …)` floors the second at zero, so
 * one boost paid for two. The doubling is the entire session reward, so that is
 * a real amount of free currency.
 *
 * The guard lives in the WHERE clause, which Postgres re-evaluates against the
 * row it locks — so exactly one concurrent caller can win, and the answer comes
 * back as "did this UPDATE touch a row" rather than as a value read earlier and
 * hoped to still be true.
 */
export async function spendFocusBoost(userId: string): Promise<boolean> {
  const db = getDatabase();
  const updated = await db
    .update(users)
    .set({
      consumables: sql`jsonb_set(coalesce(${users.consumables}, '{}'::jsonb), '{focusBoost}', to_jsonb(greatest(0, coalesce((${users.consumables}->>'focusBoost')::int, 0) - 1)))`,
      updatedAt: new Date(),
    })
    .where(and(eq(users.id, userId), sql`coalesce((${users.consumables}->>'focusBoost')::int, 0) > 0`))
    .returning({ id: users.id });

  return updated.length > 0;
}

/**
 * Hand a claimed boost back.
 *
 * Claiming has to happen BEFORE the award, or it is not atomic — but the award
 * can still come back as nothing when the daily focus cap is already spent, and
 * burning a consumable for a reward of zero would be worse than the race it
 * fixes. The old ordering got this half right by decrementing only when
 * `focusRes.awarded`; this keeps that property while making the claim safe.
 */
export async function refundFocusBoost(userId: string): Promise<void> {
  const db = getDatabase();
  await db
    .update(users)
    .set({
      consumables: sql`jsonb_set(coalesce(${users.consumables}, '{}'::jsonb), '{focusBoost}', to_jsonb(coalesce((${users.consumables}->>'focusBoost')::int, 0) + 1))`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}
