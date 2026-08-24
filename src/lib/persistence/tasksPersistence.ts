/**
 * tasksPersistence.ts
 * Thin client-side wrappers around /api/tasks.
 * Never calls Drizzle directly — all DB access lives in the API routes.
 */

import type { Task } from '@/types/task';
import { apiFetch, apiGetList, ok, type FetchResult } from './apiClient';
import {
  GUEST_COLLECTIONS,
  isGuestUser,
  readGuest,
  writeGuest,
} from './guestStorage';
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

// ── Public API ────────────────────────────────────────────────────────────────────

/**
 * Fetch all tasks for the currently authenticated user.
 *
 * Returns a `FetchResult` rather than `Task[]`: a 500, an expired session and a
 * dropped connection used to be indistinguishable from "this user has no
 * tasks", so a transient failure rendered as an empty board with no error and
 * no retry. The caller must now decide which it is.
 */
export async function fetchAllForCurrentUser(): Promise<FetchResult<Task[]>> {
  // Guest mode reads localStorage and cannot fail. Before this existed, a
  // guest's tasks went to /api/tasks, got 401, and were swallowed into an
  // empty board — in-memory only, destroyed by any reload, with no error shown.
  if (isGuestUser()) return ok(readGuestTasks());

  return apiGetList<Task & { status?: ApiTaskStatus }, Task>('/api/tasks', (task) => ({
    ...task,
    status: mapApiStatusToUi((task.status ?? 'todo') as ApiTaskStatus),
  }));
}

// ── Guest mode ───────────────────────────────────────────────────

export function readGuestTasks(): Task[] {
  return readGuest<Task[]>(GUEST_COLLECTIONS.tasks, []);
}

function writeGuestTasks(tasks: Task[]): void {
  writeGuest(GUEST_COLLECTIONS.tasks, tasks);
}

/** Persist a new task to the DB. Returns the DB-assigned UUID, or null on failure. */
export async function createOne(task: Task): Promise<string | null> {
  if (isGuestUser()) {
    const tasks = readGuestTasks();
    tasks.push(task);
    writeGuestTasks(tasks);
    // The client-generated id IS the id in guest mode, so subsequent PATCHes
    // against it resolve locally instead of 404ing against a server that never
    // saw this row.
    return task.id;
  }
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

/**
 * Update an existing task.
 *
 * P1-17: this returned `void` and only inspected `res.ok` to decide whether to
 * award coins — a 400/403/500 on the PATCH itself was discarded. Callers that
 * want to revert an optimistic edit can now await the boolean.
 */
export async function updateOne(id: string, patch: Partial<Task>): Promise<boolean> {
  if (isGuestUser()) {
    const tasks = readGuestTasks();
    const index = tasks.findIndex((t) => t.id === id);
    if (index >= 0) {
      tasks[index] = { ...tasks[index], ...patch };
      writeGuestTasks(tasks);
    }
    // No coin award: the economy is account-only and runs server-side.
    return index >= 0;
  }
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
    return res.ok;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[tasksPersistence] updateOne failed:', err);
    }
    return false;
  }
}

/** Delete a task from the DB. Fire-and-forget safe. */
/**
 * Delete a task.
 *
 * P1-17: this never read `res.ok` at all, so a failed delete was
 * indistinguishable from a successful one and the row reappeared on reload.
 */
export async function deleteOne(id: string): Promise<boolean> {
  if (isGuestUser()) {
    writeGuestTasks(readGuestTasks().filter((t) => t.id !== id));
    return true;
  }
  try {
    const res = await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[tasksPersistence] deleteOne failed:', err);
    }
    return false;
  }
}

/**
 * Persist a new order for several tasks in ONE request.
 *
 * P1-17: a drag-reorder fired `updated.forEach(t => updateOne(t.id, {order}))`
 * — an N-request fan-out where any subset can fail, leaving the board's order
 * permanently divergent from the database with no signal. One request either
 * applies the whole reorder or none of it.
 */
export async function reorderMany(
  items: Array<{ id: string; order: number }>,
): Promise<boolean> {
  if (items.length === 0) return true;

  if (isGuestUser()) {
    const byId = new Map(items.map((i) => [i.id, i.order]));
    writeGuestTasks(
      readGuestTasks().map((t) => (byId.has(t.id) ? { ...t, order: byId.get(t.id)! } : t)),
    );
    return true;
  }

  try {
    const res = await apiFetch('/api/tasks/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ items }),
    });
    return res.ok;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[tasksPersistence] reorderMany failed:', err);
    }
    return false;
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
