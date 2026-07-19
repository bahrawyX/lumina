/**
 * Server-side streak calculation utilities.
 * Called from POST /api/focus-sessions after inserting a session.
 */

const SESSION_STREAK_GAP_MS = 4 * 60 * 60 * 1000; // 4 hours

/** Hard ceiling on a single focus session's rewarded length (8 hours). */
export const MAX_SESSION_MINUTES = 480;

/**
 * How far a client-reported duration may exceed server wall-clock time before
 * it is treated as tampering rather than clock skew / rounding.
 */
export const DURATION_TAMPER_TOLERANCE_SECS = 120;

/**
 * Derive the server-trusted, bounded rewarded length (in minutes) for a focus
 * session. The client-supplied `duration` is only a hint: the awarded length is
 * never more than the real elapsed wall-clock time, never more than the client
 * claims, and never above MAX_SESSION_MINUTES. Always at least 1.
 *
 * This is the C1 guard — every coin/streak reward scales off this value, so a
 * fabricated `duration` can no longer mint unbounded coins.
 */
export function rewardedSessionMinutes(wallSeconds: number, clientDurationSecs: number): number {
  const serverWallMinutes = Math.floor(Math.max(0, wallSeconds) / 60);
  const clientMinutes = Math.round(Math.max(0, clientDurationSecs) / 60);
  return Math.max(1, Math.min(serverWallMinutes, clientMinutes, MAX_SESSION_MINUTES));
}

/**
 * True when the client-reported duration exceeds real elapsed wall-clock time
 * by more than DURATION_TAMPER_TOLERANCE_SECS — a fabricated-session signal.
 */
export function isDurationTampered(wallSeconds: number, clientDurationSecs: number): boolean {
  return clientDurationSecs > wallSeconds + DURATION_TAMPER_TOLERANCE_SECS;
}

interface UserStreakFields {
  dailyStreak: number;
  bestDailyStreak: number;
  sessionStreak: number;
  bestSessionStreak: number;
  lastFocusDate: string | null; // YYYY-MM-DD
  lastSessionAt: Date | null;
  coins: number;
}

interface StreakUpdate {
  dailyStreak: number;
  bestDailyStreak: number;
  sessionStreak: number;
  bestSessionStreak: number;
  lastFocusDate: string;
  lastSessionAt: Date;
  coins: number;
}

/**
 * Compute updated streak values after a completed focus session.
 *
 * @param user Current user streak fields from DB
 * @param durationMinutes How many minutes the completed session lasted
 * @param timezone IANA timezone string for the user (default UTC)
 */
export function computeStreakUpdate(
  user: UserStreakFields,
  durationMinutes: number,
  timezone = 'UTC',
): StreakUpdate {
  const now = new Date();

  // Resolve today's date in the user's timezone
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // en-CA gives YYYY-MM-DD

  // ─── Daily streak ──────────────────────────────────────────────────────────
  let { dailyStreak } = user;

  if (user.lastFocusDate === todayStr) {
    // Already counted today — no daily streak change
  } else if (user.lastFocusDate === getYesterday(todayStr)) {
    dailyStreak += 1;
  } else {
    dailyStreak = 1;
  }
  const bestDailyStreak = Math.max(user.bestDailyStreak, dailyStreak);

  // ─── Session streak ────────────────────────────────────────────────────────
  let sessionStreak = user.sessionStreak;
  if (
    user.lastSessionAt &&
    now.getTime() - user.lastSessionAt.getTime() < SESSION_STREAK_GAP_MS
  ) {
    sessionStreak += 1;
  } else {
    sessionStreak = 1;
  }
  const bestSessionStreak = Math.max(user.bestSessionStreak, sessionStreak);

  // ─── Coins ─────────────────────────────────────────────────────────────────
  const coinsEarned = Math.max(1, durationMinutes); // 1 coin per minute, minimum 1
  const coins = user.coins + coinsEarned;

  return {
    dailyStreak,
    bestDailyStreak,
    sessionStreak,
    bestSessionStreak,
    lastFocusDate: todayStr,
    lastSessionAt: now,
    coins,
  };
}

/** Returns the YYYY-MM-DD string for the day before the given date string. */
function getYesterday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
