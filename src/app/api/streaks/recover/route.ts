import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

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

    // Use streak shield: decrement count, restore streak to best-1 (at least 1)
    const restoredStreak = Math.max(1, user.dailyStreak > 0 ? user.dailyStreak : (user.bestDailyStreak > 0 ? user.bestDailyStreak - 1 : 1));
    const updatedConsumables = {
      focusBoost: 0,
      streakShield: 0,
      taskMultiplier: 0,
      autoPlan: 0,
      goalAccelerator: 0,
      ...consumables,
    };
    updatedConsumables.streakShield = Math.max(0, shieldCount - 1);

    // Set lastFocusDate to today so the streak continues
    const today = new Date().toISOString().slice(0, 10);

    await db
      .update(users)
      .set({
        consumables: updatedConsumables,
        dailyStreak: restoredStreak,
        lastFocusDate: today,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return NextResponse.json({
      ok: true,
      shieldUsed: true,
      restoredStreak,
      remainingShields: updatedConsumables.streakShield,
    });
  } catch (err) {
    console.error('[POST /api/streaks/recover]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
