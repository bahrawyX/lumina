import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

const DEFAULT_PREFS = {
  dailyBrief: true,
  eventReminders: true,
  streakReminder: true,
  taskReminders: true,
  focusComplete: false,
};

// PATCH — update notification preferences (merge, not replace)
export async function PATCH(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const db = getDatabase();
  const userId = session.user.id;

  // Read current preferences
  const [user] = await db
    .select({ notificationPreferences: users.notificationPreferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const current = (user?.notificationPreferences as typeof DEFAULT_PREFS | null) ?? DEFAULT_PREFS;

  // Merge only valid keys
  const merged = { ...current };
  for (const key of Object.keys(DEFAULT_PREFS) as (keyof typeof DEFAULT_PREFS)[]) {
    if (typeof body[key] === 'boolean') {
      merged[key] = body[key];
    }
  }

  // Also update timezone if provided (IANA string like 'America/New_York')
  const updateSet: Record<string, unknown> = {
    notificationPreferences: merged,
    updatedAt: new Date(),
  };
  if (typeof body.timezone === 'string' && body.timezone.length > 0 && body.timezone.length < 64) {
    updateSet.timezone = body.timezone;
  }

  await db
    .update(users)
    .set(updateSet)
    .where(eq(users.id, userId));

  return NextResponse.json({ ok: true, preferences: merged });
}

// GET — read current notification preferences
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDatabase();
  const [user] = await db
    .select({ notificationPreferences: users.notificationPreferences })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return NextResponse.json({
    preferences: (user?.notificationPreferences as typeof DEFAULT_PREFS | null) ?? DEFAULT_PREFS,
  });
}
