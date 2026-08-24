import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { awardCoins } from '@/lib/coins/awardCoins';
import { scopeAward, utcDateKey } from '@/lib/coins/dedupeKeys';
import { dailyBriefDismissAward } from '@/lib/coins/earnRules';
import { logger } from '@/lib/logger';

/** POST /api/coins/award-brief — award coins for reading the daily brief (once per UTC day) */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    // M1: idempotency is enforced by the ledger dedupe key `daily_brief:<utc-date>`
    // (unique per user/day), not by a check-then-insert race. A second request the
    // same day resolves to a no-op duplicate.
    const entry = scopeAward(dailyBriefDismissAward(), { utcDate: utcDateKey(new Date()) });
    const { newBalance, outcomes } = await awardCoins(userId, [entry]);
    const awarded = outcomes[0]?.awarded ?? false;
    return NextResponse.json({
      ok: true,
      alreadyAwarded: !awarded,
      coinsEarned: awarded ? entry.amount : 0,
      newBalance,
    });
  } catch (err) {
    logger.error('unhandled', { route: 'POST /api/coins/award-brief' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
