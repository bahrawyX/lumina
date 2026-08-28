import type { MoodLog, MoodValue } from '@/types';
import { apiFetch, apiGetList } from './apiClient';
import { GUEST_COLLECTIONS, isGuestUser, readGuest, writeGuest } from './guestStorage';
import { uid } from '@/lib/uid';

/**
 * Mood logs.
 *
 * ## Two things were wrong here
 *
 * **P0-2 / F5.2** — this module carried its own private `apiBase()` and
 * `apiFetch()`, one of three copies that survived the consolidation onto
 * `apiClient`. That meant mood requests went around the shared client, so:
 * a 401 never reached `onUnauthorized`, and `SessionExpiryWatcher` therefore
 * never learned the session had died from anything the user did on this
 * screen; and the F5.2 expiry guard could not refuse the write either.
 *
 * **F6.1** — a guest's mood log was POSTed, 401'd, and swallowed. The mood
 * picker appears right after a focus session, so the guest was asked how that
 * went and their answer was discarded, silently, every time.
 */

function readGuestMoods(): MoodLog[] {
  return readGuest<MoodLog[]>(GUEST_COLLECTIONS.mood, []);
}

function writeGuestMoods(logs: MoodLog[]): void {
  writeGuest(GUEST_COLLECTIONS.mood, logs);
}

export async function logMood(data: {
  focusSessionId?: string;
  mood: MoodValue;
  note?: string;
}): Promise<{ id: string } | null> {
  if (isGuestUser()) {
    const id = uid();
    const entry = {
      id,
      focusSessionId: data.focusSessionId,
      mood: data.mood,
      note: data.note,
      createdAt: new Date().toISOString(),
    } as unknown as MoodLog;
    writeGuestMoods([...readGuestMoods(), entry]);
    return { id };
  }

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
  if (isGuestUser()) {
    // Newest first, matching what the API returns.
    return readGuestMoods().slice(-limit).reverse();
  }

  const result = await apiGetList<MoodLog>(`/api/mood-logs?limit=${limit}`);
  // This returned `[]` on failure, which for a mood history is the same
  // "an error looks like no data" shape P0-2 was opened for. The caller
  // still gets an array, but the failure is now visible to the 401
  // interceptor via `apiFetch` underneath.
  return result.kind === 'ok' ? result.data : [];
}
