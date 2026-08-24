import { apiFetch, dedupedGetJson } from './apiClient';

export interface StreakData {
  coins: number;
  dailyStreak: number;
  bestDailyStreak: number;
  sessionStreak: number;
  bestSessionStreak: number;
}


export async function fetchStreakData(): Promise<StreakData | null> {
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
  try {
    const res = await apiFetch('/api/streaks/recover', { method: 'POST' });
    return res.json();
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}
