import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { users } from '@/db/schema';
import { getDatabase } from '@/lib/db';

const MIN_FOCUS_MINUTES = 5;
const MAX_FOCUS_MINUTES = 240;
const DEFAULT_FOCUS_MINUTES = 25;
const VALID_AMBIENT_TRACKS = ['brown', 'rainfall', 'forest', 'ocean'] as const;
const TIME_RE = /^\d{2}:\d{2}$/;

function normalizeFocusSessionLength(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < MIN_FOCUS_MINUTES || rounded > MAX_FOCUS_MINUTES) return null;
  return rounded;
}

function isValidTimeString(v: unknown): v is string {
  return typeof v === 'string' && TIME_RE.test(v);
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
        timezone: users.timezone,
        notificationPreferences: users.notificationPreferences,
        workStart: users.workStart,
        workEnd: users.workEnd,
        shortBreakMins: users.shortBreakMins,
        longBreakMins: users.longBreakMins,
        sessionsPerCycle: users.sessionsPerCycle,
        ambientTrack: users.ambientTrack,
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
      timezone: row.timezone ?? 'UTC',
      notificationPreferences: row.notificationPreferences ?? {
        dailyBrief: true,
        eventReminders: true,
        streakReminder: true,
        taskReminders: true,
        focusComplete: false,
      },
      workStart: row.workStart ?? '09:00',
      workEnd: row.workEnd ?? '17:00',
      shortBreakMins: row.shortBreakMins ?? 5,
      longBreakMins: row.longBreakMins ?? 20,
      sessionsPerCycle: row.sessionsPerCycle ?? 4,
      ambientTrack: row.ambientTrack ?? null,
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

  const update: Partial<{
    focusSessionLength: number;
    workStart: string;
    workEnd: string;
    shortBreakMins: number;
    longBreakMins: number;
    sessionsPerCycle: number;
    ambientTrack: string | null;
    updatedAt: Date;
  }> = { updatedAt: new Date() };

  if (body.focusSessionLength !== undefined) {
    const n = normalizeFocusSessionLength(body.focusSessionLength);
    if (n === null) {
      return NextResponse.json({
        error: `focusSessionLength must be a number between ${MIN_FOCUS_MINUTES} and ${MAX_FOCUS_MINUTES}`,
      }, { status: 400 });
    }
    update.focusSessionLength = n;
  }

  if (body.workStart !== undefined) {
    if (!isValidTimeString(body.workStart)) {
      return NextResponse.json({ error: 'workStart must be HH:mm' }, { status: 400 });
    }
    update.workStart = body.workStart;
  }

  if (body.workEnd !== undefined) {
    if (!isValidTimeString(body.workEnd)) {
      return NextResponse.json({ error: 'workEnd must be HH:mm' }, { status: 400 });
    }
    update.workEnd = body.workEnd;
  }

  if (body.shortBreakMins !== undefined) {
    if (typeof body.shortBreakMins !== 'number') {
      return NextResponse.json({ error: 'shortBreakMins must be a number' }, { status: 400 });
    }
    update.shortBreakMins = Math.max(1, Math.min(30, Math.round(body.shortBreakMins)));
  }

  if (body.longBreakMins !== undefined) {
    if (typeof body.longBreakMins !== 'number') {
      return NextResponse.json({ error: 'longBreakMins must be a number' }, { status: 400 });
    }
    update.longBreakMins = Math.max(5, Math.min(60, Math.round(body.longBreakMins)));
  }

  if (body.sessionsPerCycle !== undefined) {
    if (typeof body.sessionsPerCycle !== 'number') {
      return NextResponse.json({ error: 'sessionsPerCycle must be a number' }, { status: 400 });
    }
    update.sessionsPerCycle = Math.max(1, Math.min(10, Math.round(body.sessionsPerCycle)));
  }

  if (body.ambientTrack !== undefined) {
    if (body.ambientTrack !== null && !VALID_AMBIENT_TRACKS.includes(body.ambientTrack as typeof VALID_AMBIENT_TRACKS[number])) {
      return NextResponse.json({ error: 'Invalid ambientTrack' }, { status: 400 });
    }
    update.ambientTrack = body.ambientTrack as string | null;
  }

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  try {
    const db = getDatabase();
    await db
      .update(users)
      .set(update)
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/users/preferences]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
