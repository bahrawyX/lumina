/**
 * focusPersistence.ts
 * Thin client-side wrappers around /api/focus-sessions.
 * Active session state (pause/resume position) remains in localStorage
 * because it is truly ephemeral/transient, not a canonical record.
 * Only completed/cancelled session history is DB-backed.
 */

import type { FocusSession } from '@/store/useFocusStore';

// ── Helpers ────────────────────────────────────────────────────────────────────

function apiBase() {
  if (typeof window !== 'undefined') return '';
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  return res;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Fetch focus session history for the currently authenticated user. */
export async function fetchAllForCurrentUser(): Promise<FocusSession[]> {
  try {
    const res = await apiFetch('/api/focus-sessions');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Record a completed or cancelled focus session to the DB. Fire-and-forget safe. */
export async function createOne(session: FocusSession): Promise<void> {
  try {
    await apiFetch('/api/focus-sessions', {
      method: 'POST',
      body: JSON.stringify(session),
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[focusPersistence] createOne failed:', err);
    }
  }
}

/** Delete a focus session from history. Fire-and-forget safe. */
export async function deleteOne(id: string): Promise<void> {
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
