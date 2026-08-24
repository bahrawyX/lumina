import { NextRequest, NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { focusSessions, users, achievements, tasks, goals } from '@/db/schema';
import { computeStreakUpdate, rewardedSessionMinutes, isDurationTampered, MAX_DAILY_FOCUS_MINUTES } from '@/utils/streaks/streakUtils';
import { checkNewAchievements } from '@/utils/streaks/achievementUtils';
import { awardCoins, awardFocusCoins } from '@/lib/coins/awardCoins';
import { scopeAwards, utcDateKey } from '@/lib/coins/dedupeKeys';
import { focusSessionAwards, streakMilestoneAwards } from '@/lib/coins/earnRules';
import { logger } from '@/lib/logger';

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
    logger.error('unhandled', { route: 'GET /api/focus-sessions' }, err);
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

  // Wall-clock elapsed is the server-trusted source of truth for how much real
  // time passed — the client cannot lengthen a session by inflating `duration`.
  const wallSeconds = (endTs.getTime() - startTs.getTime()) / 1000;

  // C1: `duration` (seconds) is a client hint only. A reported focus length that
  // exceeds real elapsed time beyond a small skew/rounding tolerance is a
  // fabricated session — reject it. Logged without PII.
  if (isDurationTampered(wallSeconds, duration)) {
    logger.warn('rejected: reported duration exceeds elapsed time', {
      route: 'POST /api/focus-sessions',
      userId,
      wallSeconds: Math.round(wallSeconds),
      reportedDurationSecs: Math.round(duration),
    });
    return NextResponse.json({ error: 'Reported duration exceeds elapsed time' }, { status: 400 });
  }

  // Planned duration is optional — only the Pomodoro flow sends it. When it is
  // omitted (free-form timer / stopwatch) we fall back to the client's reported
  // `duration` as the completion target so the 75% gate applies to every session.
  const plannedDurationSecs = typeof body.plannedDurationSecs === 'number' && body.plannedDurationSecs > 0
    ? body.plannedDurationSecs
    : null;
  const completionTargetSecs = plannedDurationSecs ?? duration;

  // 75% completion gate — only rewards sessions that actually ran their course.
  // A user who starts a 25-min Pomodoro and stops it after 10 seconds must not
  // earn coins, streak credit, or achievements.
  const underThreshold = wallSeconds < 0.75 * completionTargetSecs;

  // C1: the rewarded length is derived server-side and bounded — never more than
  // real elapsed time, never more than the client claims, never above the hard
  // cap (MAX_SESSION_MINUTES). This value drives every coin/streak award below.
  const durationMinutes = rewardedSessionMinutes(wallSeconds, duration);
  const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';

  try {
    const db = getDatabase();

    // Batch 5 (FK ownership on create): a session may only link the caller's own
    // task / goal. A foreign goalId would otherwise pollute that user's
    // goal-progress aggregation. Checked early — before any streak/coin work.
    const bodyTaskId = typeof body.taskId === 'string' && body.taskId ? body.taskId : null;
    const bodyGoalId = typeof body.goalId === 'string' && body.goalId ? body.goalId : null;
    if (bodyTaskId) {
      const [t] = await db.select({ id: tasks.id }).from(tasks)
        .where(and(eq(tasks.id, bodyTaskId), eq(tasks.userId, userId))).limit(1);
      if (!t) return NextResponse.json({ error: 'taskId not found' }, { status: 404 });
    }
    if (bodyGoalId) {
      const [g] = await db.select({ id: goals.id }).from(goals)
        .where(and(eq(goals.id, bodyGoalId), eq(goals.userId, userId))).limit(1);
      if (!g) return NextResponse.json({ error: 'goalId not found' }, { status: 404 });
    }

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
          coinsEarned: 0, // set after the cap-bounded award resolves (below)
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
        // M6: BARE onConflictDoNothing (no target) — deliberately order-independent
        // vs migration 0019. Pre-0019 there is no (user_id, type) index, so this
        // is a no-op guard (dups can still insert, exactly as prod does today) and
        // it NEVER throws. Once 0019 lands, the unique index makes a concurrent
        // duplicate unlock hit ON CONFLICT DO NOTHING → no second row, `ach`
        // undefined, not re-reported. A targeted conflict clause would 42P10 here.
        const [ach] = await tx
          .insert(achievements)
          .values({ userId, type })
          .onConflictDoNothing()
          .returning({ unlockedAt: achievements.unlockedAt });
        if (ach) newAchievements.push({ type, unlockedAt: ach.unlockedAt.toISOString() });
      }

      return { sessionId: row.id, newAchievements };
    });

    // Coins are awarded here (awaited, not fire-and-forget — durable on serverless,
    // H10) and bounded by the per-day focus-minute cap. Skipped under threshold.
    let finalCoins = userRow.coins;
    let coinsEarned = 0;
    if (streakUpdate) {
      // Task priority + focus-boost consumable feed the reward and the decrement.
      let taskPriority: string | undefined;
      if (rawTaskId) {
        const [t] = await db.select({ priority: tasks.priority }).from(tasks)
          .where(and(eq(tasks.id, rawTaskId), eq(tasks.userId, userId))).limit(1);
        taskPriority = t?.priority;
      }
      const [uc] = await db.select({ consumables: users.consumables }).from(users).where(eq(users.id, userId));
      const hasFocusBoost = ((uc?.consumables as Record<string, number>)?.focusBoost ?? 0) > 0;
      const utcDate = utcDateKey(new Date());

      // The full focus reward as a function of granted (post-cap) minutes: the
      // 1-coin/min base plus the earn-rule bonuses, all scaled off granted so the
      // daily cap bounds every focus-scaled reward (C1 aggregate fix).
      const focusRes = await awardFocusCoins(userId, {
        sessionId: result.sessionId,
        utcDate,
        requestedMinutes: durationMinutes,
        maxDailyMinutes: MAX_DAILY_FOCUS_MINUTES,
        coinsForMinutes: (granted) =>
          granted + focusSessionAwards(granted, taskPriority, false, hasFocusBoost).reduce((s, a) => s + a.amount, 0),
      });
      finalCoins = focusRes.newBalance;

      // Consume one focus boost only if the focus reward was actually granted —
      // atomic decrement on the live JSON column (no stale-snapshot overwrite).
      if (hasFocusBoost && focusRes.awarded) {
        await db.update(users).set({
          consumables: sql`jsonb_set(coalesce(${users.consumables}, '{}'::jsonb), '{focusBoost}', to_jsonb(greatest(0, coalesce((${users.consumables}->>'focusBoost')::int, 0) - 1)))`,
        }).where(eq(users.id, userId));
      }

      // Streak milestones are event-based (once per user), not minute-capped.
      const milestones = streakMilestoneAwards(streakUpdate.dailyStreak, streakUpdate.sessionStreak);
      if (milestones.length > 0) {
        finalCoins = (await awardCoins(userId, scopeAwards(milestones, { utcDate }))).newBalance;
      }

      coinsEarned = finalCoins - previousCoins;
      if (coinsEarned !== 0) {
        await db.update(focusSessions).set({ coinsEarned }).where(eq(focusSessions.id, result.sessionId));
      }
    }

    return NextResponse.json(
      {
        id: result.sessionId,
        coinsEarned,
        newCoins: finalCoins,
        dailyStreak: streakUpdate ? streakUpdate.dailyStreak : userRow.dailyStreak,
        sessionStreak: streakUpdate ? streakUpdate.sessionStreak : userRow.sessionStreak,
        newAchievements: result.newAchievements,
        ...(underThreshold ? { underThreshold: true } : {}),
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error('unhandled', { route: 'POST /api/focus-sessions' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
