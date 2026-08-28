import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { accounts, users } from '@/db/schema';
import { getDatabase } from '@/lib/db';
import { apiError } from '@/lib/logger';
import { invalidateUserTimeZone } from '@/lib/time/eventTimeZone';

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
        customCategories: users.customCategories,
        onboardingCompletedAt: users.onboardingCompletedAt,
        userRole: users.userRole,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // P2-14: the delete-account flow needs to know whether to ask for a
    // password or to require a recently-created session. Only the boolean is
    // exposed — never the hash, and never which social provider is linked.
    const credential = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, session.user.id), eq(accounts.providerId, 'credential')))
      .limit(1);

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
      customCategories: row.customCategories ?? [],
      // F8.1 — the durable record of onboarding. localStorage is only a cache.
      onboardingCompleted: row.onboardingCompletedAt !== null,
      onboardingCompletedAt: row.onboardingCompletedAt,
      userRole: row.userRole ?? '',
      hasPassword: credential.length > 0,
    });
  } catch (err) {
    return apiError('GET /api/users/preferences', err);
  }
}

/**
 * True if `tz` is a zone this runtime recognises. Guards against a client
 * writing junk (or a deliberately wrong zone) into the column that day
 * boundaries, streaks and reminders are computed from.
 */
function isValidTimeZone(tz: string): boolean {
  if (tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
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
    name: string;
    focusSessionLength: number;
    workStart: string;
    workEnd: string;
    shortBreakMins: number;
    longBreakMins: number;
    sessionsPerCycle: number;
    ambientTrack: string | null;
    customCategories: Array<{ name: string; color: string }>;
    timezone: string;
    userRole: string;
    onboardingCompletedAt: Date | null;
    updatedAt: Date;
  }> = { updatedAt: new Date() };

  if (body.name !== undefined) {
    if (typeof body.name !== 'string') {
      return NextResponse.json({ error: 'name must be a string' }, { status: 400 });
    }
    const trimmed = body.name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      return NextResponse.json({ error: 'name must be 2-80 characters' }, { status: 400 });
    }
    update.name = trimmed;
  }

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

  if (body.customCategories !== undefined) {
    if (!Array.isArray(body.customCategories)) {
      return NextResponse.json({ error: 'customCategories must be an array' }, { status: 400 });
    }
    if (body.customCategories.length > 64) {
      return NextResponse.json({ error: 'Too many custom categories (max 64)' }, { status: 400 });
    }
    const cleaned: Array<{ name: string; color: string }> = [];
    for (const raw of body.customCategories) {
      if (!raw || typeof raw !== 'object') {
        return NextResponse.json({ error: 'customCategories entries must be objects' }, { status: 400 });
      }
      const r = raw as { name?: unknown; color?: unknown };
      if (typeof r.name !== 'string' || typeof r.color !== 'string') {
        return NextResponse.json({ error: 'customCategories entries need name + color strings' }, { status: 400 });
      }
      const name = r.name.trim().slice(0, 40);
      const color = r.color.trim().slice(0, 32);
      if (name.length === 0 || color.length === 0) continue;
      cleaned.push({ name, color });
    }
    update.customCategories = cleaned;
  }

  if (body.timezone !== undefined) {
    // `users.timezone` was previously written ONLY when the user opened
    // settings, while three other places guessed at "the user's timezone" —
    // including a client-supplied body field that fed the streak calculation
    // directly. This makes the column writable from onboarding so it can be the
    // single source of truth.
    if (typeof body.timezone !== 'string' || !isValidTimeZone(body.timezone)) {
      return NextResponse.json({ error: 'timezone must be a valid IANA zone' }, { status: 400 });
    }
    update.timezone = body.timezone;
  }

  if (body.userRole !== undefined) {
    if (typeof body.userRole !== 'string') {
      return NextResponse.json({ error: 'userRole must be a string' }, { status: 400 });
    }
    update.userRole = body.userRole.trim().slice(0, 120);
  }

  if (body.onboardingCompleted !== undefined) {
    if (typeof body.onboardingCompleted !== 'boolean') {
      return NextResponse.json({ error: 'onboardingCompleted must be a boolean' }, { status: 400 });
    }
    // Set once, never un-set by a later PATCH re-sending `true` — re-running the
    // flow should not rewrite the original completion time.
    update.onboardingCompletedAt = body.onboardingCompleted ? new Date() : null;
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

    // `getUserTimeZone` memoises for 30s per user. Now that every server-side
    // day boundary reads that column (P2-8), a stale memo means the change the
    // user just made does not take effect for half a minute.
    if (update.timezone !== undefined) invalidateUserTimeZone(session.user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError('PATCH /api/users/preferences', err);
  }
}
