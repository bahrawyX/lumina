import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { spendStreakShield } from '@/lib/streaks/spendStreakShield';
import { logger } from '@/lib/logger';

/** POST /api/streaks/recover — use streak shield consumable to recover streak */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const db = getDatabase();

    const [user] = await db
      .select({
        consumables: users.consumables,
        dailyStreak: users.dailyStreak,
        bestDailyStreak: users.bestDailyStreak,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const consumables = (user.consumables as Record<string, number>) ?? {};
    const shieldCount = consumables.streakShield ?? 0;

    if (shieldCount <= 0) {
      // No shield available — return payment required
      return NextResponse.json(
        { ok: false, reason: 'payment_required' },
        { status: 402 },
      );
    }

    // H4: atomic guarded shield spend (see spendStreakShield). Concurrent
    // recoveries can't both spend the same shield.
    const restoredStreak = Math.max(1, user.dailyStreak > 0 ? user.dailyStreak : (user.bestDailyStreak > 0 ? user.bestDailyStreak - 1 : 1));
    const today = new Date().toISOString().slice(0, 10);

    const { spent, remaining } = await spendStreakShield(userId, restoredStreak, today);
    if (!spent) {
      // Lost the race (or shield already spent) — nothing was decremented.
      return NextResponse.json({ ok: false, reason: 'payment_required' }, { status: 402 });
    }

    return NextResponse.json({
      ok: true,
      shieldUsed: true,
      restoredStreak,
      remainingShields: remaining,
    });
  } catch (err) {
    logger.error('unhandled', { route: 'POST /api/streaks/recover' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
