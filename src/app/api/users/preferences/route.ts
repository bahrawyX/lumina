import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { users } from '@/db/schema';
import { getDatabase } from '@/lib/db';

const MIN_FOCUS_MINUTES = 5;
const MAX_FOCUS_MINUTES = 240;
const DEFAULT_FOCUS_MINUTES = 25;

function normalizeFocusSessionLength(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < MIN_FOCUS_MINUTES || rounded > MAX_FOCUS_MINUTES) return null;
  return rounded;
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDatabase();
    const rows = await db
      .select({
        focusSessionLength: users.focusSessionLength,
        coins: users.coins,
        dailyStreak: users.dailyStreak,
        bestDailyStreak: users.bestDailyStreak,
        sessionStreak: users.sessionStreak,
        bestSessionStreak: users.bestSessionStreak,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const row = rows[0];
    return NextResponse.json({
      focusSessionLength: row.focusSessionLength ?? DEFAULT_FOCUS_MINUTES,
      coins: row.coins,
      dailyStreak: row.dailyStreak,
      bestDailyStreak: row.bestDailyStreak,
      sessionStreak: row.sessionStreak,
      bestSessionStreak: row.bestSessionStreak,
    });
  } catch (err) {
    console.error('[GET /api/users/preferences]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const normalized = normalizeFocusSessionLength(body.focusSessionLength);
  if (normalized === null) {
    return NextResponse.json({
      error: `focusSessionLength must be a number between ${MIN_FOCUS_MINUTES} and ${MAX_FOCUS_MINUTES}`,
    }, { status: 400 });
  }

  try {
    const db = getDatabase();
    await db
      .update(users)
      .set({
        focusSessionLength: normalized,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ ok: true, focusSessionLength: normalized });
  } catch (err) {
    console.error('[PATCH /api/users/preferences]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
