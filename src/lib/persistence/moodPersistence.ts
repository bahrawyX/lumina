import type { MoodLog, MoodValue } from '@/types';

function apiBase() {
  if (typeof window !== 'undefined') return '';
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

async function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
}

export async function logMood(data: {
  focusSessionId?: string;
  mood: MoodValue;
  note?: string;
}): Promise<{ id: string } | null> {
  try {
    const res = await apiFetch('/api/mood-logs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchMoodLogs(limit = 30): Promise<MoodLog[]> {
  try {
    const res = await apiFetch(`/api/mood-logs?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
