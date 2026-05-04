import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { focusSessions, users, achievements, tasks } from '@/db/schema';
import { computeStreakUpdate } from '@/utils/streaks/streakUtils';
import { checkNewAchievements } from '@/utils/streaks/achievementUtils';
import { awardCoinsBatch } from '@/lib/coins/awardCoins';
import { focusSessionAwards, streakMilestoneAwards } from '@/lib/coins/earnRules';

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

  // Wall-clock elapsed is the source of truth: the client cannot lie about
  // how much real time has passed.
  const wallSeconds = (endTs.getTime() - startTs.getTime()) / 1000;

  // Planned duration is optional — only the Pomodoro flow sends it. The
  // free-form focus timer and stopwatch leave it unset and bypass the
  // completion threshold (there is no "planned" target to compare against).
  const plannedDurationSecs = typeof body.plannedDurationSecs === 'number' && body.plannedDurationSecs > 0
    ? body.plannedDurationSecs
    : null;

  // 75% completion gate — only rewards sessions that actually ran their course.
  // A user who starts a 25-min Pomodoro and stops it after 10 seconds must not
  // earn coins, streak credit, or achievements.
  const underThreshold = plannedDurationSecs !== null && wallSeconds < 0.75 * plannedDurationSecs;

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

    // Compute streak + coin updates — skipped entirely when under threshold so
    // a fractional session cannot move the streak forward or award coins.
    const previousCoins = userRow.coins;
    const streakUpdate = underThreshold
      ? null
      : computeStreakUpdate(
          {
            ...userRow,
            lastFocusDate: userRow.lastFocusDate ?? null,
            lastSessionAt: userRow.lastSessionAt ?? null,
          },
          durationMinutes,
          timezone,
        );

    const coinsEarned = streakUpdate ? streakUpdate.coins - previousCoins : 0;

    // Resolve task title before the transaction (read-only lookup)
    const rawTaskId = typeof body.taskId === 'string' && body.taskId ? body.taskId : null;
    // Prefer client-sent taskTitle, but validate/fallback to DB lookup
    const rawTaskTitle = typeof body.taskTitle === 'string' && body.taskTitle.trim() ? body.taskTitle.trim() : null;
    let taskTitle: string | null = rawTaskTitle;
    // Goal id can come from the client OR be inferred from the linked task.
    // Inference matters because most clients won't track which goal a task
    // belongs to — they just send taskId.
    let resolvedGoalId: string | null =
      typeof body.goalId === 'string' && body.goalId ? body.goalId : null;
    if (rawTaskId && (!taskTitle || !resolvedGoalId)) {
      const [taskRow] = await db
        .select({ title: tasks.title, goalId: tasks.goalId })
        .from(tasks)
        .where(and(eq(tasks.id, rawTaskId), eq(tasks.userId, userId)))
        .limit(1);
      if (!taskTitle) taskTitle = taskRow?.title ?? null;
      if (!resolvedGoalId) resolvedGoalId = taskRow?.goalId ?? null;
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
          goalId: resolvedGoalId,
          startTime: startTs,
          endTime: endTs,
          durationMinutes,
          coinsEarned,
        })
        .returning({ id: focusSessions.id });

      // Under-threshold sessions are logged for history only — no streak bump,
      // no coin award, no achievement unlocks.
      if (!streakUpdate) {
        return { sessionId: row.id, newAchievements: [] as { type: string; unlockedAt: string }[] };
      }

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

    // Fire-and-forget: additional coin awards from the new earn rules engine.
    // These are ON TOP of the existing streak-based 1 coin/min from computeStreakUpdate.
    // Skipped when under threshold — no bonus rewards for partial sessions.
    if (streakUpdate) {
      const streakSnapshot = streakUpdate;
      void (async () => {
        try {
          // Lookup task priority for bonus
          let taskPriority: string | undefined;
          if (rawTaskId) {
            const [t] = await db.select({ priority: tasks.priority }).from(tasks).where(eq(tasks.id, rawTaskId)).limit(1);
            taskPriority = t?.priority;
          }
          // Check for focus boost consumable
          const [u] = await db.select({ consumables: users.consumables }).from(users).where(eq(users.id, userId));
          const consumables = (u?.consumables as Record<string, number>) ?? {};
          const hasFocusBoost = (consumables.focusBoost ?? 0) > 0;

          const awards = focusSessionAwards(durationMinutes, taskPriority, false, hasFocusBoost);
          const streakAwards = streakMilestoneAwards(streakSnapshot.dailyStreak, streakSnapshot.sessionStreak);
          const allAwards = [...awards, ...streakAwards];

          if (allAwards.length > 0) {
            await awardCoinsBatch(userId, allAwards);
            // Decrement focus boost if used
            if (hasFocusBoost) {
              const updated = { focusBoost: 0, streakShield: 0, taskMultiplier: 0, autoPlan: 0, goalAccelerator: 0, ...consumables };
              updated.focusBoost = Math.max(0, (consumables.focusBoost ?? 0) - 1);
              await db.update(users).set({ consumables: updated }).where(eq(users.id, userId));
            }
          }
        } catch (e) {
          console.error('[focus-sessions] additional coin awards failed', e);
        }
      })();
    }

    return NextResponse.json(
      {
        id: result.sessionId,
        coinsEarned,
        newCoins: streakUpdate ? streakUpdate.coins : userRow.coins,
        dailyStreak: streakUpdate ? streakUpdate.dailyStreak : userRow.dailyStreak,
        sessionStreak: streakUpdate ? streakUpdate.sessionStreak : userRow.sessionStreak,
        newAchievements: result.newAchievements,
        ...(underThreshold ? { underThreshold: true } : {}),
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[POST /api/focus-sessions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
