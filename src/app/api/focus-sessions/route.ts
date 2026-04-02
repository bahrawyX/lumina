import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { focusSessions, users, achievements, tasks } from '@/db/schema';
import { computeStreakUpdate } from '@/utils/streaks/streakUtils';
import { checkNewAchievements } from '@/utils/streaks/achievementUtils';

/** GET /api/focus-sessions — return session history for the authenticated user */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const db = getDatabase();
    const rows = await db
      .select()
      .from(focusSessions)
      .where(eq(focusSessions.userId, userId))
      .orderBy(focusSessions.startTime);

    const mapped = rows.map((row) => ({
      id: row.id,
      taskId: row.taskId ?? '',
      taskTitle: row.taskTitle ?? null,
      startTime: row.startTime.toISOString(),
      endTime: row.endTime.toISOString(),
      duration: row.durationMinutes * 60,
      completed: true,
    }));

    return NextResponse.json(mapped);
  } catch (err) {
    console.error('[GET /api/focus-sessions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/focus-sessions — record a completed session with streak/coin/achievement updates */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { startTime, endTime, duration } = body as {
    startTime?: string;
    endTime?: string;
    duration?: number;
  };

  if (!startTime || !endTime || typeof duration !== 'number' || duration < 1) {
    return NextResponse.json({ error: 'startTime, endTime, and duration are required' }, { status: 400 });
  }

  const startTs = new Date(startTime);
  const endTs = new Date(endTime);

  if (isNaN(startTs.getTime()) || isNaN(endTs.getTime()) || endTs <= startTs) {
    return NextResponse.json({ error: 'Invalid timestamps' }, { status: 400 });
  }

  const durationMinutes = Math.max(1, Math.round(duration / 60));
  const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';

  try {
    const db = getDatabase();

    // Fetch current user streak data (outside transaction — read-only)
    const [userRow] = await db
      .select({
        coins: users.coins,
        dailyStreak: users.dailyStreak,
        bestDailyStreak: users.bestDailyStreak,
        sessionStreak: users.sessionStreak,
        bestSessionStreak: users.bestSessionStreak,
        lastFocusDate: users.lastFocusDate,
        lastSessionAt: users.lastSessionAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRow) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Compute streak + coin updates
    const previousCoins = userRow.coins;
    const streakUpdate = computeStreakUpdate(
      {
        ...userRow,
        lastFocusDate: userRow.lastFocusDate ?? null,
        lastSessionAt: userRow.lastSessionAt ?? null,
      },
      durationMinutes,
      timezone,
    );

    const coinsEarned = streakUpdate.coins - previousCoins;

    // Resolve task title before the transaction (read-only lookup)
    const rawTaskId = typeof body.taskId === 'string' && body.taskId ? body.taskId : null;
    // Prefer client-sent taskTitle, but validate/fallback to DB lookup
    const rawTaskTitle = typeof body.taskTitle === 'string' && body.taskTitle.trim() ? body.taskTitle.trim() : null;
    let taskTitle: string | null = rawTaskTitle;
    if (rawTaskId && !taskTitle) {
      const [taskRow] = await db
        .select({ title: tasks.title })
        .from(tasks)
        .where(and(eq(tasks.id, rawTaskId), eq(tasks.userId, userId)))
        .limit(1);
      taskTitle = taskRow?.title ?? null;
    }

    // All writes in a single transaction for atomicity
    const result = await db.transaction(async (tx) => {
      // Insert focus session
      const [row] = await tx
        .insert(focusSessions)
        .values({
          userId,
          taskId: rawTaskId,
          taskTitle,
          startTime: startTs,
          endTime: endTs,
          durationMinutes,
          coinsEarned,
        })
        .returning({ id: focusSessions.id });

      // Update user streak + coin fields
      await tx
        .update(users)
        .set({
          coins: streakUpdate.coins,
          dailyStreak: streakUpdate.dailyStreak,
          bestDailyStreak: streakUpdate.bestDailyStreak,
          sessionStreak: streakUpdate.sessionStreak,
          bestSessionStreak: streakUpdate.bestSessionStreak,
          lastFocusDate: streakUpdate.lastFocusDate,
          lastSessionAt: streakUpdate.lastSessionAt,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      // Check for new achievements
      const existingAchievements = await tx
        .select({ type: achievements.type })
        .from(achievements)
        .where(eq(achievements.userId, userId));

      const existingTypes = new Set(existingAchievements.map((a) => a.type));
      const newTypes = checkNewAchievements(
        {
          sessionStreak: streakUpdate.sessionStreak,
          dailyStreak: streakUpdate.dailyStreak,
          coins: streakUpdate.coins,
        },
        previousCoins,
        existingTypes,
      );

      const newAchievements: { type: string; unlockedAt: string }[] = [];
      for (const type of newTypes) {
        const [ach] = await tx
          .insert(achievements)
          .values({ userId, type })
          .returning({ unlockedAt: achievements.unlockedAt });
        newAchievements.push({ type, unlockedAt: ach.unlockedAt.toISOString() });
      }

      return { sessionId: row.id, newAchievements };
    });

    return NextResponse.json(
      {
        id: result.sessionId,
        coinsEarned,
        newCoins: streakUpdate.coins,
        dailyStreak: streakUpdate.dailyStreak,
        sessionStreak: streakUpdate.sessionStreak,
        newAchievements: result.newAchievements,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[POST /api/focus-sessions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
