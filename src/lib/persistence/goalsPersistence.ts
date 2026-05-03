/**
 * Goals persistence layer — fire-and-forget pattern matching tasksPersistence.ts
 */
import type { Goal, GoalTarget } from '@/types/goal';
import { useCoinsStore } from '@/store/useCoinsStore';

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

export async function createOne(
  goal: Record<string, unknown>,
): Promise<{ goalId?: string; targetIds?: string[] } | null> {
  try {
    const res = await apiFetch('/api/goals', {
      method: 'POST',
      body: JSON.stringify(goal),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      goalId?: string;
      targetIds?: string[];
      newBalance?: number;
    };
    // Server awards `goal_created` coins and returns the post-award balance.
    if (typeof data.newBalance === 'number') {
      useCoinsStore.getState().setBalance(data.newBalance);
    }
    return { goalId: data.goalId, targetIds: data.targetIds };
  } catch (err) {
    if (isDev) console.error('[goalsPersistence.createOne]', err);
    return null;
  }
}

export async function updateOne(id: string, patch: Partial<Goal>): Promise<void> {
  try {
    const res = await apiFetch(`/api/goals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    // Server awards `goal_complete` coins when status flips to 'completed'.
    // The endpoint awaits the award and returns `newBalance` so the badge
    // updates synchronously with the toast — no debounced-refetch race.
    if (patch.status === 'completed') {
      try {
        const data = (await res.json()) as { newBalance?: number };
        if (typeof data?.newBalance === 'number') {
          useCoinsStore.getState().setBalance(data.newBalance);
        } else {
          useCoinsStore.getState().invalidateBalance();
        }
      } catch {
        useCoinsStore.getState().invalidateBalance();
      }
    }
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
  const res = await apiFetch(`/api/goals/${goalId}/targets/${targetId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`[goalsPersistence.updateTarget] HTTP ${res.status}`);
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
