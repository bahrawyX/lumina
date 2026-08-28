/**
 * focusPersistence.ts
 * Thin client-side wrappers around /api/focus-sessions.
 * Active session state (pause/resume position) remains in localStorage
 * because it is truly ephemeral/transient, not a canonical record.
 * Only completed/cancelled session history is DB-backed.
 */

import type { FocusSession } from '@/store/useFocusStore';
import type { FocusSessionResult } from '@/types';
import { apiFetch, apiGetList, ok, type FetchResult } from './apiClient';
import {
  GUEST_COLLECTIONS,
  isGuestUser,
  readGuest,
  writeGuest,
} from './guestStorage';

/**
 * F6.1: a guest's completed focus sessions were POSTed, 401'd and swallowed —
 * so the one screen that exists to show "what you actually did" showed nothing
 * after a reload.
 */
function readGuestSessions(): FocusSession[] {
  return readGuest<FocusSession[]>(GUEST_COLLECTIONS.focus, []);
}

function writeGuestSessions(sessions: FocusSession[]): void {
  writeGuest(GUEST_COLLECTIONS.focus, sessions);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Fetch focus session history for the currently authenticated user.
 *
 * See `tasksPersistence.fetchAllForCurrentUser` — a failure must not read as a
 * user who has never run a focus session.
 */
export async function fetchAllForCurrentUser(): Promise<FetchResult<FocusSession[]>> {
  if (isGuestUser()) return ok(readGuestSessions());
  return apiGetList<FocusSession>('/api/focus-sessions');
}

/**
 * Record a completed or cancelled focus session to the DB.
 * Returns the server's FocusSessionResult (streak + coin updates) so the
 * caller can apply them to the relevant stores. Returns null on error.
 */
export async function createOne(session: FocusSession): Promise<FocusSessionResult | null> {
  if (isGuestUser()) {
    writeGuestSessions([...readGuestSessions(), session]);
    // The session is recorded; the streak and coin fields the server would
    // return are not invented. A guest has neither — see `guestGate.ts` — and
    // returning zeros here is what makes the UI honest rather than showing a
    // streak that will not survive sign-up.
    return {
      id: session.id,
      coinsEarned: 0,
      newCoins: 0,
      dailyStreak: 0,
      sessionStreak: 0,
      newAchievements: [],
    };
  }
  try {
    const res = await apiFetch('/api/focus-sessions', {
      method: 'POST',
      body: JSON.stringify({
        ...session,
        // Pass the browser's timezone so daily-streak date arithmetic is correct
        // for users outside UTC. Falls back to UTC on SSR (shouldn't happen here).
        timezone:
          typeof window !== 'undefined'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : 'UTC',
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as FocusSessionResult;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[focusPersistence] createOne failed:', err);
    }
    return null;
  }
}

/** Delete a focus session from history. Fire-and-forget safe. */
export async function deleteOne(id: string): Promise<void> {
  if (isGuestUser()) {
    writeGuestSessions(readGuestSessions().filter((s) => s.id !== id));
    return;
  }
  try {
    await apiFetch(`/api/focus-sessions/${id}`, { method: 'DELETE' });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[focusPersistence] deleteOne failed:', err);
    }
  }
}

/**
 * Bulk-import focus sessions to DB (future one-time localStorage migration).
 * Currently a no-op stub — deferred for safety.
 */
export async function migrateMany(_sessions: FocusSession[]): Promise<void> {
  // Intentionally deferred. Will be implemented as a separate migration flow.
}
