/**
 * Coin earn rule definitions. Each function returns an array of awards
 * (amount + reason + label) to apply. Multiple awards can stack.
 */

export type Award = { amount: number; reason: string; label: string; metadata?: Record<string, unknown> };

// ── Focus & Pomodoro ────────────────────────────────────────────────────────

export function focusSessionAwards(durationMinutes: number, taskPriority?: string, isPomoCycleComplete?: boolean, hasFocusBoost?: boolean): Award[] {
  const awards: Award[] = [];
  const base = 5;
  const perTenMin = Math.floor(durationMinutes / 10) * 2;

  awards.push({ amount: base, reason: 'focus_session', label: 'Focus session completed' });
  if (perTenMin > 0) {
    awards.push({ amount: perTenMin, reason: 'focus_duration', label: `${durationMinutes} min focused` });
  }
  if (taskPriority === 'high') {
    awards.push({ amount: 5, reason: 'focus_high_priority', label: 'High priority focus' });
  }
  if (isPomoCycleComplete) {
    awards.push({ amount: 20, reason: 'pomo_cycle', label: 'Full Pomodoro cycle' });
  }

  if (hasFocusBoost) {
    const bonus = awards.reduce((s, a) => s + a.amount, 0);
    awards.push({ amount: bonus, reason: 'focus_boost_2x', label: '2x Focus Boost active' });
  }

  return awards;
}

// ── Tasks ────────────────────────────────────────────────────────────────────

/**
 * @param dueDay   The task's due date as a 'YYYY-MM-DD' calendar day IN THE
 *                 USER'S timezone, or null.
 * @param todayLocal Today as a 'YYYY-MM-DD' calendar day in the same zone.
 *
 * P2-8: this used to take a raw date and build both days with
 * `new Date(y, m, d)`, which resolves in the SERVER's zone — UTC on Vercel. So
 * "completed on due date" flipped a day early or late for every user west of
 * Greenwich, silently paying `task_early` instead of `task_on_time` or nothing
 * at all. Comparing two calendar-day strings both derived in the user's zone
 * removes the ambiguity entirely: there is no Date arithmetic left to get wrong.
 */
export function taskCompleteAwards(
  difficulty: string,
  dueDay: string | null | undefined,
  todayLocal: string,
  hasTaskMultiplier: boolean,
): Award[] {
  const awards: Award[] = [];
  const base = difficulty === 'hard' ? 10 : 5;
  awards.push({ amount: base, reason: 'task_complete', label: difficulty === 'hard' ? 'Hard task completed' : 'Task completed' });

  if (dueDay) {
    if (dueDay > todayLocal) {
      awards.push({ amount: 8, reason: 'task_early', label: 'Completed before due date' });
    } else if (dueDay === todayLocal) {
      awards.push({ amount: 5, reason: 'task_on_time', label: 'Completed on due date' });
    }
  }

  if (hasTaskMultiplier) {
    const bonus = awards.reduce((s, a) => s + a.amount, 0);
    awards.push({ amount: bonus, reason: 'task_multiplier_2x', label: '2x Task Multiplier active' });
  }

  return awards;
}

export function allSubtasksCompleteAward(): Award {
  return { amount: 10, reason: 'all_subtasks', label: 'All subtasks completed' };
}

export function dailyTaskBurstAwards(completedToday: number): Award[] {
  const awards: Award[] = [];
  if (completedToday === 5) {
    awards.push({ amount: 25, reason: 'task_burst_5', label: '5 tasks completed today' });
  }
  if (completedToday === 10) {
    awards.push({ amount: 50, reason: 'task_burst_10', label: '10 tasks completed today' });
  }
  return awards;
}

// ── Goals ────────────────────────────────────────────────────────────────────

export function goalCreatedAward(): Award {
  return { amount: 10, reason: 'goal_created', label: 'New goal created' };
}

export function goalMilestoneAwards(previousProgress: number, newProgress: number): Award[] {
  const awards: Award[] = [];
  if (previousProgress < 50 && newProgress >= 50) {
    awards.push({ amount: 30, reason: 'goal_50', label: 'Goal 50% milestone' });
  }
  return awards;
}

export function goalCompleteAwards(timeframe: string): Award[] {
  const awards: Award[] = [];
  awards.push({ amount: 100, reason: 'goal_complete', label: 'Goal completed' });
  const bonuses: Record<string, number> = { weekly: 50, monthly: 150, quarterly: 300 };
  const bonus = bonuses[timeframe];
  if (bonus) {
    awards.push({ amount: bonus, reason: `goal_${timeframe}`, label: `${timeframe.charAt(0).toUpperCase() + timeframe.slice(1)} goal bonus` });
  }
  return awards;
}

// ── Streaks ──────────────────────────────────────────────────────────────────

export function streakMilestoneAwards(dailyStreak: number, sessionStreak: number): Award[] {
  const awards: Award[] = [];
  const dailyMilestones: Record<number, number> = { 3: 20, 7: 50, 14: 100, 30: 250 };
  if (dailyMilestones[dailyStreak]) {
    awards.push({ amount: dailyMilestones[dailyStreak], reason: `daily_streak_${dailyStreak}`, label: `${dailyStreak}-day streak` });
  }
  // Repeating every 30 days after day 30
  if (dailyStreak > 30 && dailyStreak % 30 === 0) {
    awards.push({ amount: 250, reason: `daily_streak_${dailyStreak}`, label: `${dailyStreak}-day streak` });
  }
  const sessionMilestones: Record<number, number> = { 5: 30, 10: 75 };
  if (sessionMilestones[sessionStreak]) {
    awards.push({ amount: sessionMilestones[sessionStreak], reason: `session_streak_${sessionStreak}`, label: `${sessionStreak}-session streak` });
  }
  return awards;
}

// ── Daily Actions ────────────────────────────────────────────────────────────

export function dailyBriefDismissAward(): Award {
  return { amount: 10, reason: 'daily_brief', label: 'Read Daily Brief' };
}

export function planDayAward(): Award {
  return { amount: 15, reason: 'plan_day', label: 'Planned your day' };
}

export function firstTaskOfDayAward(): Award {
  return { amount: 5, reason: 'first_task_day', label: 'First task of the day' };
}

// ── Docs ─────────────────────────────────────────────────────────────────────

export function firstDocEverAward(): Award {
  return { amount: 15, reason: 'first_doc', label: 'Created first doc' };
}

export function longDocAward(): Award {
  return { amount: 10, reason: 'long_doc', label: 'Doc over 500 words' };
}

export function aiInDocsAward(): Award {
  return { amount: 5, reason: 'ai_docs', label: 'Used AI in docs' };
}
