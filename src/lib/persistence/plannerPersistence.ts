/**
 * plannerPersistence.ts
 * STUB — planner items persistence is intentionally deferred.
 *
 * Reason: The `planner_items` DB schema requires a `task_id` FK, which means
 * tasks must be fully DB-backed first to avoid FK constraint violations.
 * Once `tasksPersistence` is proven and tasks are reliably in the DB,
 * this file can be wired up to /api/planner-items routes.
 *
 * All methods are safe no-ops. The `useDailyPlanStore` continues to use
 * localStorage as before until this layer is activated.
 */

import type { PlannedTaskItem } from '@/store/useDailyPlanStore';

export async function fetchAllForCurrentUser(): Promise<PlannedTaskItem[]> {
  return [];
}

export async function createOne(_item: PlannedTaskItem): Promise<void> {
  // Deferred
}

export async function updateOne(_id: string, _patch: Partial<PlannedTaskItem>): Promise<void> {
  // Deferred
}

export async function deleteOne(_id: string): Promise<void> {
  // Deferred
}

/**
 * Bulk-import planner items to DB (future one-time migration).
 * Currently a no-op stub.
 */
export async function migrateMany(_items: PlannedTaskItem[]): Promise<void> {
  // Deferred — requires tasks to be DB-backed first.
}
