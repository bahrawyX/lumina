export interface StreakData {
  coins: number;
  dailyStreak: number;
  bestDailyStreak: number;
  sessionStreak: number;
  bestSessionStreak: number;
}

function apiBase() {
  if (typeof window !== 'undefined') return '';
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

export async function fetchStreakData(): Promise<StreakData | null> {
  try {
    const res = await fetch(`${apiBase()}/api/users/preferences`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
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
    const res = await fetch(`${apiBase()}/api/streaks/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return res.json();
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}
