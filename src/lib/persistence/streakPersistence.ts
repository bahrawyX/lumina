import { apiFetch, dedupedGetJson } from './apiClient';
import { GUEST_UNAVAILABLE, guestGate } from './guestGate';

export interface StreakData {
  coins: number;
  dailyStreak: number;
  bestDailyStreak: number;
  sessionStreak: number;
  bestSessionStreak: number;
}


const EMPTY_STREAK: StreakData = {
  coins: 0,
  dailyStreak: 0,
  bestDailyStreak: 0,
  sessionStreak: 0,
  bestSessionStreak: 0,
};

export async function fetchStreakData(): Promise<StreakData | null> {
  // F6.1: a streak is computed server-side from `users.last_focus_date` in the
  // user's stored timezone (P2-8), for the same reason a client-supplied date
  // could not be trusted. A guest has no such row — zeros are the true answer,
  // and the gate's copy explains it rather than leaving a silent 0.
  const gate = guestGate<StreakData>(EMPTY_STREAK, GUEST_UNAVAILABLE.streak);
  if (gate.kind === 'guest') return gate.value;

  try {
    // P1-15: this and `PersistenceBootstrap` both fetch /api/users/preferences
    // on the same page load. `dedupedGetJson` coalesces them onto one request.
    const result = await dedupedGetJson<Record<string, number>>('/api/users/preferences');
    if (result.kind === 'error') return null;
    const data = result.data;
    return {
      coins: data.coins ?? 0,
      dailyStreak: data.dailyStreak ?? 0,
      bestDailyStreak: data.bestDailyStreak ?? 0,
      sessionStreak: data.sessionStreak ?? 0,
      bestSessionStreak: data.bestSessionStreak ?? 0,
    };
  } catch {
    return null;
  }
}

export async function requestStreakRecovery(): Promise<{ ok: boolean; reason?: string }> {
  const gate = guestGate<null>(null, GUEST_UNAVAILABLE.recovery);
  if (gate.kind === 'guest') return { ok: false, reason: gate.reason };

  try {
    const res = await apiFetch('/api/streaks/recover', { method: 'POST' });
    return res.json();
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}
