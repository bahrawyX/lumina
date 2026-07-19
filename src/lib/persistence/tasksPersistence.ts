/**
 * tasksPersistence.ts
 * Thin client-side wrappers around /api/tasks.
 * Never calls Drizzle directly — all DB access lives in the API routes.
 */

import type { Task } from '@/types/task';
import { useCoinsStore } from '@/store/useCoinsStore';
import { showCoinToast } from '@/lib/coins/showCoinToast';
import { triggerConfetti } from '@/components/ui/ConfettiEffect';

type ApiTaskStatus = 'todo' | 'doing' | 'done';

function mapApiStatusToUi(status: ApiTaskStatus): Task['status'] {
  if (status === 'doing') return 'doing';
  return status;
}

function mapUiStatusToDb(status: Task['status'] | undefined): 'todo' | 'doing' | 'done' | undefined {
  if (!status) return undefined;
  return status;
}

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

/** Fetch all tasks for the currently authenticated user. */
export async function fetchAllForCurrentUser(): Promise<Task[]> {
  try {
    const res = await apiFetch('/api/tasks');
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .map((task: Task & { status?: ApiTaskStatus }) => ({
      ...task,
      status: mapApiStatusToUi((task.status ?? 'todo') as ApiTaskStatus),
    }));
  } catch {
    return [];
  }
}

/** Persist a new task to the DB. Returns the DB-assigned UUID, or null on failure. */
export async function createOne(task: Task): Promise<string | null> {
  try {
    const payload = {
      ...task,
      status: mapUiStatusToDb(task.status),
    };
    const res = await apiFetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.id === 'string' ? data.id : null;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[tasksPersistence] createOne failed:', err);
    }
    return null;
  }
}

/** Update an existing task in the DB. Fire-and-forget safe. */
export async function updateOne(id: string, patch: Partial<Task>): Promise<void> {
  try {
    const payload = {
      ...patch,
      status: mapUiStatusToDb(patch.status),
    };
    const res = await apiFetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    // Server awards coins (per-difficulty, first-task-of-day, burst, all-
    // subtasks-done) when status flips to 'done'. The endpoint awaits the
    // award and returns `newBalance` so we can sync directly — no race
    // with an in-flight DB transaction.
    if (res.ok && patch.status === 'done') {
      try {
        const data = (await res.json()) as { newBalance?: number; coinsEarned?: number };
        if (typeof data?.newBalance === 'number') {
          useCoinsStore.getState().setBalance(data.newBalance);
        } else {
          useCoinsStore.getState().invalidateBalance();
        }
        // Fire the coin toast ONLY when the server actually awarded coins.
        // A re-completion (done→todo→done) is a dedupe duplicate → coinsEarned 0
        // → silent, matching goals/focus. The old client-side toast fired on
        // every completion, including duplicates.
        if (typeof data?.coinsEarned === 'number' && data.coinsEarned > 0) {
          showCoinToast(data.coinsEarned, 'Task completed');
          // Confetti (owned cosmetic) fires on the SAME real-award gate as the
          // toast — it no longer bursts on a re-completion that awarded nothing.
          // No full trophy here: too heavy for the frequency of task completions;
          // the trophy stays goal-only (both on the coinsEarned > 0 gate).
          if (useCoinsStore.getState().activeCosmetics.confetti) void triggerConfetti();
        }
      } catch {
        useCoinsStore.getState().invalidateBalance();
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[tasksPersistence] updateOne failed:', err);
    }
  }
}

/** Delete a task from the DB. Fire-and-forget safe. */
export async function deleteOne(id: string): Promise<void> {
  try {
    await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[tasksPersistence] deleteOne failed:', err);
    }
  }
}

/**
 * Bulk-import tasks to DB (future one-time localStorage migration).
 * Currently a no-op stub — deferred for safety.
 */
export async function migrateMany(_tasks: Task[]): Promise<void> {
  void _tasks;
  // Intentionally deferred. Will be implemented as a separate migration flow.
}
