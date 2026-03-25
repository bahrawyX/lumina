/**
 * tasksPersistence.ts
 * Thin client-side wrappers around /api/tasks.
 * Never calls Drizzle directly — all DB access lives in the API routes.
 */

import type { Task } from '@/types/task';

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

/** Persist a new task to the DB. Fire-and-forget safe. */
export async function createOne(task: Task): Promise<void> {
  try {
    const payload = {
      ...task,
      status: mapUiStatusToDb(task.status),
    };
    await apiFetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[tasksPersistence] createOne failed:', err);
    }
  }
}

/** Update an existing task in the DB. Fire-and-forget safe. */
export async function updateOne(id: string, patch: Partial<Task>): Promise<void> {
  try {
    const payload = {
      ...patch,
      status: mapUiStatusToDb(patch.status),
    };
    await apiFetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
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
