/**
 * plannerPersistence.ts
 * Thin client-side wrappers around /api/planner-items.
 * Never calls Drizzle directly — all DB access lives in the API routes.
 *
 * Returns items in the PlannedTaskItem shape that useDailyPlanStore expects.
 * The API stores full ISO timestamps; this layer converts to/from the
 * planDate (YYYY-MM-DD) + startTime/endTime (HH:mm) format the store uses.
 */

import type { PlannedTaskItem } from '@/store/useDailyPlanStore';
import { useCoinsStore } from '@/store/useCoinsStore';
import { apiFetch, apiGetList, type FetchResult } from './apiClient';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a PlannedTaskItem (planDate YYYY-MM-DD + HH:mm times) to ISO
 * timestamps that the API/DB expects.
 */
function toISOTimestamps(item: PlannedTaskItem): { startTime: string; endTime: string } {
  const startTime = new Date(`${item.planDate}T${item.startTime}:00`).toISOString();
  const endTime = new Date(`${item.planDate}T${item.endTime}:00`).toISOString();
  return { startTime, endTime };
}

/** Convert an API row (ISO timestamps) to the PlannedTaskItem shape. */
interface ApiPlannerItem {
  id: string;
  taskId: string;
  startTime: string; // ISO
  endTime: string;   // ISO
  isAutoScheduled: boolean;
  createdAt: string;
  updatedAt: string;
}

function fromApiRow(row: ApiPlannerItem): PlannedTaskItem {
  const start = new Date(row.startTime);
  const end = new Date(row.endTime);
  const planDate = start.toISOString().slice(0, 10);
  const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;

  return {
    id: row.id,
    taskId: row.taskId,
    planDate,
    startTime,
    endTime,
    order: 0, // will be re-assigned by the store on hydration
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch all planner items for the currently authenticated user.
 *
 * See `tasksPersistence.fetchAllForCurrentUser` — a failure must not read as an
 * empty day plan.
 */
export async function fetchAllForCurrentUser(): Promise<FetchResult<PlannedTaskItem[]>> {
  return apiGetList<ApiPlannerItem, PlannedTaskItem>('/api/planner-items', fromApiRow);
}

/** Persist a new planner item to the DB. Throws on failure so caller can rollback. */
export async function createOne(item: PlannedTaskItem): Promise<string> {
  const { startTime, endTime } = toISOTimestamps(item);
  const res = await apiFetch('/api/planner-items', {
    method: 'POST',
    body: JSON.stringify({ taskId: item.taskId, startTime, endTime }),
  });
  if (!res.ok) {
    throw new Error(`createOne failed (${res.status})`);
  }
  const json = (await res.json()) as { id: string; newBalance?: number };
  // Server awards a `planner_day` coin once per day on the third item.
  // It awaits the award and returns `newBalance` when one was granted.
  if (typeof json.newBalance === 'number') {
    useCoinsStore.getState().setBalance(json.newBalance);
  }
  return json.id;
}

/** Update an existing planner item in the DB. Throws on failure. */
export async function updateOne(
  id: string,
  patch: Partial<Pick<PlannedTaskItem, 'startTime' | 'endTime' | 'planDate'>>,
  /** Current item for computing full ISO timestamps when only one time field changes */
  current: PlannedTaskItem,
): Promise<void> {
  const merged: PlannedTaskItem = { ...current, ...patch };
  const body: Record<string, string> = {};
  if (patch.startTime || patch.planDate) {
    body.startTime = new Date(`${merged.planDate}T${merged.startTime}:00`).toISOString();
  }
  if (patch.endTime || patch.planDate) {
    body.endTime = new Date(`${merged.planDate}T${merged.endTime}:00`).toISOString();
  }
  if (Object.keys(body).length === 0) return;

  const res = await apiFetch(`/api/planner-items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`updateOne failed (${res.status})`);
  }
}

/** Delete a planner item from the DB. Throws on failure. */
export async function deleteOne(id: string): Promise<void> {
  const res = await apiFetch(`/api/planner-items/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(`deleteOne failed (${res.status})`);
  }
}

/**
 * Bulk-create planner items. Used during auto-plan and rollover.
 * Returns the DB-assigned IDs mapped to client-side temp IDs.
 */
export async function createMany(
  items: PlannedTaskItem[],
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>();
  // Sequential to avoid race conditions on constraint checks.
  // Batch is typically ≤ 10 items so latency is acceptable.
  for (const item of items) {
    try {
      const dbId = await createOne(item);
      idMap.set(item.id, dbId);
    } catch {
      // Partial failure — caller handles inconsistency
    }
  }
  return idMap;
}

/**
 * Bulk-import planner items to DB (future one-time localStorage migration).
 * Currently a no-op stub.
 */
export async function migrateMany(_items: PlannedTaskItem[]): Promise<void> {
  // Intentionally deferred — will be a separate migration flow.
}
