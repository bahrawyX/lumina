/**
 * Goals persistence layer — fire-and-forget pattern matching tasksPersistence.ts
 */
import type { Goal, GoalTarget } from '@/types/goal';

const isDev = process.env.NODE_ENV === 'development';

function apiBase(): string {
  return typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_APP_URL ?? '');
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
}

export async function fetchAllForCurrentUser(): Promise<Goal[]> {
  try {
    const res = await apiFetch('/api/goals');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    if (isDev) console.error('[goalsPersistence.fetchAll] failed');
    return [];
  }
}

export async function createOne(goal: Record<string, unknown>): Promise<{ goalId?: string } | null> {
  try {
    const res = await apiFetch('/api/goals', {
      method: 'POST',
      body: JSON.stringify(goal),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (isDev) console.error('[goalsPersistence.createOne]', err);
    return null;
  }
}

export async function updateOne(id: string, patch: Partial<Goal>): Promise<void> {
  try {
    await apiFetch(`/api/goals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  } catch (err) {
    if (isDev) console.error('[goalsPersistence.updateOne]', err);
  }
}

export async function deleteOne(id: string, hard = false): Promise<void> {
  try {
    await apiFetch(`/api/goals/${id}${hard ? '?hard=true' : ''}`, { method: 'DELETE' });
  } catch (err) {
    if (isDev) console.error('[goalsPersistence.deleteOne]', err);
  }
}

export async function addTarget(goalId: string, target: Partial<GoalTarget> & { title: string; type: string }): Promise<{ id?: string } | null> {
  try {
    const res = await apiFetch(`/api/goals/${goalId}/targets`, {
      method: 'POST',
      body: JSON.stringify(target),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (isDev) console.error('[goalsPersistence.addTarget]', err);
    return null;
  }
}

export async function updateTarget(goalId: string, targetId: string, patch: Partial<GoalTarget>): Promise<void> {
  try {
    await apiFetch(`/api/goals/${goalId}/targets/${targetId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  } catch (err) {
    if (isDev) console.error('[goalsPersistence.updateTarget]', err);
  }
}

export async function deleteTarget(goalId: string, targetId: string): Promise<void> {
  try {
    await apiFetch(`/api/goals/${goalId}/targets/${targetId}`, { method: 'DELETE' });
  } catch (err) {
    if (isDev) console.error('[goalsPersistence.deleteTarget]', err);
  }
}

export async function migrateMany(_goals: Goal[]): Promise<void> {
  // Stub for future localStorage migration
}
