import { getDatabase } from '@/lib/db';
import { users, coinTransactions } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';

/**
 * Atomically award (or deduct) coins to a user.
 * Inserts a coin_transaction record and updates the user's balance.
 * Returns the new balance.
 *
 * @param userId — user UUID
 * @param amount — positive for earn, negative for spend
 * @param reason — machine-readable reason (e.g. "task_complete")
 * @param label — human-readable label (e.g. "Completed a hard task")
 * @param metadata — optional extra data
 */
export async function awardCoins(
  userId: string,
  amount: number,
  reason: string,
  label: string,
  metadata?: Record<string, unknown>
): Promise<number> {
  const db = getDatabase();

  const result = await db.transaction(async (tx) => {
    // Insert transaction record
    await tx.insert(coinTransactions).values({
      userId,
      amount,
      reason,
      label,
      metadata: metadata ?? {},
    });

    // Atomically update user balance
    const [updated] = await tx
      .update(users)
      .set({ coins: sql`COALESCE(${users.coins}, 0) + ${amount}` })
      .where(eq(users.id, userId))
      .returning({ coins: users.coins });

    return updated?.coins ?? 0;
  });

  return result;
}

/**
 * Award multiple coin batches in one transaction.
 * Useful when a single action triggers multiple earn rules.
 * Returns the new balance.
 */
export async function awardCoinsBatch(
  userId: string,
  awards: Array<{ amount: number; reason: string; label: string; metadata?: Record<string, unknown> }>
): Promise<number> {
  if (awards.length === 0) return 0;

  const totalAmount = awards.reduce((sum, a) => sum + a.amount, 0);
  if (totalAmount === 0) return 0;

  const db = getDatabase();

  const result = await db.transaction(async (tx) => {
    // Insert all transaction records
    await tx.insert(coinTransactions).values(
      awards.map(a => ({
        userId,
        amount: a.amount,
        reason: a.reason,
        label: a.label,
        metadata: a.metadata ?? {},
      }))
    );

    // Atomically update user balance with total
    const [updated] = await tx
      .update(users)
      .set({ coins: sql`COALESCE(${users.coins}, 0) + ${totalAmount}` })
      .where(eq(users.id, userId))
      .returning({ coins: users.coins });

    return updated?.coins ?? 0;
  });

  return result;
}
