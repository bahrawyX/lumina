import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { coinTransactions } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { awardCoins } from '@/lib/coins/awardCoins';

/** POST /api/coins/award-brief — award coins for reading daily brief (once per day) */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const db = getDatabase();

    // Check if already awarded today
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const [existing] = await db
      .select({ id: coinTransactions.id })
      .from(coinTransactions)
      .where(
        and(
          eq(coinTransactions.userId, userId),
          eq(coinTransactions.reason, 'daily_brief'),
          sql`${coinTransactions.createdAt} >= ${todayStart}`
        )
      )
      .limit(1);

    if (existing) {
      return NextResponse.json({ ok: true, alreadyAwarded: true });
    }

    const newBalance = await awardCoins(userId, 10, 'daily_brief', 'Read your Daily Brief');
    return NextResponse.json({ ok: true, coinsEarned: 10, newBalance });
  } catch (err) {
    console.error('[POST /api/coins/award-brief]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
