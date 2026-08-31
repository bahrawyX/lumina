/**
 * Goals persistence layer — fire-and-forget pattern matching tasksPersistence.ts
 */
import type { Goal, GoalTarget } from '@/types/goal';
import { useCoinsStore } from '@/store/useCoinsStore';
import { useCelebrationStore } from '@/store/useCelebrationStore';
import { showCoinToast } from '@/lib/coins/showCoinToast';
import { toast } from 'sonner';
import { apiFetch, apiGetList, ok, type FetchResult } from './apiClient';
import {
  GUEST_COLLECTIONS,
  isGuestUser,
  readGuest,
  writeGuest,
} from './guestStorage';

/**
 * F6.1: every function here went straight to the API. For a guest that meant a
 * 401, swallowed — so a goal created in guest mode existed in memory only and
 * was gone on reload, while the banner said their work was kept on the device.
 */
function readGuestGoals(): Goal[] {
  return readGuest<Goal[]>(GUEST_COLLECTIONS.goals, []);
}

function writeGuestGoals(goals: Goal[]): void {
  writeGuest(GUEST_COLLECTIONS.goals, goals);
}

const isDev = process.env.NODE_ENV === 'development';

/**
 * Fetch all goals for the currently authenticated user.
 *
 * See `tasksPersistence.fetchAllForCurrentUser` — a failure must not read as a
 * user with zero goals.
 */
export async function fetchAllForCurrentUser(): Promise<FetchResult<Goal[]>> {
  if (isGuestUser()) return ok(readGuestGoals());
  return apiGetList<Goal>('/api/goals');
}

export async function createOne(
  goal: Record<string, unknown>,
): Promise<{ goalId?: string; targetIds?: string[] } | null> {
  if (isGuestUser()) {
    // No coin award: the server owns the economy, and a guest has no ledger.
    // See `guestGate.ts`.
    const goalId = (goal.id as string | undefined) ?? crypto.randomUUID();
    writeGuestGoals([...readGuestGoals(), { ...goal, id: goalId } as unknown as Goal]);
    return { goalId, targetIds: [] };
  }
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

export async function updateOne(id: string, patch: Partial<Goal>): Promise<boolean> {
  if (isGuestUser()) {
    const goals = readGuestGoals();
    const index = goals.findIndex((g) => g.id === id);
    if (index < 0) return false;
    goals[index] = { ...goals[index], ...patch };
    writeGuestGoals(goals);
    // Deliberately no coin toast or celebration on the guest path: nothing was
    // awarded, so celebrating would be the "+400 coins on a failed save" bug
    // this function was already fixed for, in a new costume.
    return true;
  }
  try {
    const res = await apiFetch(`/api/goals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      // Surface the real failure once instead of silently swallowing — the
      // user explicitly asked for visibility into "why does the toast fire
      // when the server returned 500". Read the body if any.
      let detail = '';
      try {
        const errBody = (await res.json()) as { error?: string; detail?: string };
        detail = errBody.detail ?? errBody.error ?? '';
      } catch { /* ignore */ }
      if (isDev) console.error('[goalsPersistence.updateOne] non-OK', res.status, detail);
      if (patch.status === 'completed') {
        toast.error(detail ? `Couldn't save completion: ${detail}` : 'Couldn\'t save goal completion');
      }
      return false;
    }
    // Server awards `goal_complete` coins when status flips to 'completed'.
    // The toast + balance update fire here so they only happen when the
    // server confirms — no more "+400 coins" celebration on a failed save.
    if (patch.status === 'completed') {
      try {
        const data = (await res.json()) as { newBalance?: number; coinsEarned?: number };
        if (typeof data?.newBalance === 'number') {
          useCoinsStore.getState().setBalance(data.newBalance);
        } else {
          useCoinsStore.getState().invalidateBalance();
        }
        if (typeof data?.coinsEarned === 'number' && data.coinsEarned > 0) {
          showCoinToast(data.coinsEarned, 'Goal completed!');
          // Trophy on a REAL award only — the old GoalsPage trigger fired
          // optimistically, so a re-completed goal celebrated with no coins.
          useCelebrationStore.getState().celebrateForAward(data.coinsEarned);
        }
      } catch {
        useCoinsStore.getState().invalidateBalance();
      }
    }
    return true;
  } catch (err) {
    if (isDev) console.error('[goalsPersistence.updateOne]', err);
    if (patch.status === 'completed') {
      toast.error('Couldn\'t reach the server to save completion');
    }
    return false;
  }
}

/**
 * Returns whether the goal is actually gone.
 *
 * This awaited the fetch and then discarded the response entirely — no
 * `res.ok`, no return value — so a 404 or a 500 was indistinguishable from a
 * successful delete, and the caller had nothing to check even if it wanted to.
 * The equivalents in `eventsPersistence` and `docsPersistence` both report,
 * which is what P1-17 established; this one was missed.
 */
export async function deleteOne(id: string, hard = false): Promise<boolean> {
  if (isGuestUser()) {
    writeGuestGoals(readGuestGoals().filter((g) => g.id !== id));
    return true;
  }
  try {
    const res = await apiFetch(`/api/goals/${id}${hard ? '?hard=true' : ''}`, { method: 'DELETE' });
    return res.ok;
  } catch (err) {
    if (isDev) console.error('[goalsPersistence.deleteOne]', err);
    return false;
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
