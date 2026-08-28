import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { users, coinTransactions } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { apiError } from '@/lib/logger';

/** GET /api/coins — returns full economy data for authenticated user */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const db = getDatabase();

    const [user] = await db
      .select({
        coins: users.coins,
        activeCosmetics: users.activeCosmetics,
        ownedItems: users.ownedItems,
        consumables: users.consumables,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Last 50 transactions
    const txs = await db
      .select()
      .from(coinTransactions)
      .where(eq(coinTransactions.userId, userId))
      .orderBy(desc(coinTransactions.createdAt))
      .limit(50);

    return NextResponse.json({
      balance: user.coins ?? 0,
      transactions: txs.map(t => ({
        id: t.id,
        amount: t.amount,
        reason: t.reason,
        label: t.label,
        metadata: t.metadata,
        createdAt: t.createdAt.toISOString(),
      })),
      consumables: user.consumables ?? { focusBoost: 0, streakShield: 0, taskMultiplier: 0, autoPlan: 0, goalAccelerator: 0 },
      ownedItems: user.ownedItems ?? [],
      activeCosmetics: user.activeCosmetics ?? {},
    });
  } catch (err) {
    return apiError('GET /api/coins', err);
  }
}
