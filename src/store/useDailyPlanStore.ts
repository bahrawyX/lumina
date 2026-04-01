import { create } from 'zustand';
import { format, parseISO, isValid } from 'date-fns';
import { toast } from 'sonner';
import { uid } from '@/lib/uid';
import * as plannerPersistence from '@/lib/persistence/plannerPersistence';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlannedTaskItem {
  id: string;          // plan-item id (independent of task id)
  taskId: string;
  planDate: string;    // YYYY-MM-DD
  startTime: string;   // HH:mm
  endTime: string;     // HH:mm
  order: number;
  createdAt: string;
  updatedAt: string;
}

interface DailyPlanState {
  plansByDate: Record<string, PlannedTaskItem[]>;

  /** True once the store has been hydrated from the DB (or marked as failed). */
  dbHydrated: boolean;

  // ── Hydration ─────────────────────────────────────────────────────────────
  hydrateFromDb: (items: PlannedTaskItem[]) => void;
  hydrateFromDbFailed: () => void;

  // ── Actions ───────────────────────────────────────────────────────────────
  addPlanItem: (taskId: string, planDate: string, startTime: string, endTime: string) => PlannedTaskItem | null;
  batchAddPlanItems: (planDate: string, items: { taskId: string; startTime: string; endTime: string }[]) => PlannedTaskItem[];
  removePlanItem: (planItemId: string, planDate: string) => void;
  removeAllByTaskId: (taskId: string) => void;
  updatePlanItem: (planItemId: string, planDate: string, patch: Partial<Pick<PlannedTaskItem, 'startTime' | 'endTime' | 'order'>>) => void;
  reorderPlanItems: (planDate: string, orderedIds: string[]) => void;
  getPlanItemsForDate: (planDate: string) => PlannedTaskItem[];
}

// ── Validation helpers ───────────────────────────────────────────────────────

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function isValidDate(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  if (!DATE_ONLY_RE.test(v)) return false;
  return isValid(parseISO(v));
}

function isValidTime(v: unknown): v is string {
  return typeof v === 'string' && TIME_RE.test(v);
}

// ── Error toast ──────────────────────────────────────────────────────────────

function showSaveError(retryFn?: () => void) {
  toast.error("Couldn't save your plan. Changes may not persist.", {
    action: retryFn ? { label: 'Retry', onClick: retryFn } : undefined,
    duration: 5000,
  });
}

// ── Guest check (non-hook, reads store directly) ─────────────────────────────

function isGuestUser(): boolean {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('lumina-guest') : null;
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { state?: { isGuest?: boolean } };
    return parsed?.state?.isGuest === true;
  } catch {
    return false;
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useDailyPlanStore = create<DailyPlanState>((set, get) => ({
  plansByDate: {},
  dbHydrated: false,

  // ── Hydration ─────────────────────────────────────────────────────────────

  hydrateFromDb: (items) => {
    const grouped: Record<string, PlannedTaskItem[]> = {};
    for (const item of items) {
      if (!grouped[item.planDate]) grouped[item.planDate] = [];
      grouped[item.planDate].push(item);
    }
    // Sort each date by order, re-assign stable sequential order
    for (const date of Object.keys(grouped)) {
      grouped[date].sort((a, b) => a.order - b.order);
      grouped[date] = grouped[date].map((item, i) => ({ ...item, order: i }));
    }
    set({ plansByDate: grouped, dbHydrated: true });
  },

  hydrateFromDbFailed: () => {
    // Mark as hydrated so the UI unblocks. Plans stay empty — no localStorage fallback.
    set({ dbHydrated: true });
  },

  // ── Actions ───────────────────────────────────────────────────────────────

  addPlanItem: (taskId, planDate, startTime, endTime) => {
    if (!isValidDate(planDate) || !isValidTime(startTime) || !isValidTime(endTime)) return null;
    if (!taskId.trim()) return null;

    const existing = get().plansByDate[planDate] ?? [];
    if (existing.some((item) => item.taskId === taskId)) return null;

    const now = new Date().toISOString();
    const newItem: PlannedTaskItem = {
      id: uid('plan_'),
      taskId,
      planDate,
      startTime,
      endTime,
      order: existing.length,
      createdAt: now,
      updatedAt: now,
    };

    // Optimistic update
    set((state) => {
      const dateItems = [...(state.plansByDate[planDate] ?? []), newItem];
      return { plansByDate: { ...state.plansByDate, [planDate]: dateItems } };
    });

    // Persist (skip for guests)
    if (!isGuestUser()) {
      plannerPersistence.createOne(newItem).then((dbId) => {
        // Replace client-generated ID with DB ID
        set((state) => {
          const dateItems = (state.plansByDate[planDate] ?? []).map((item) =>
            item.id === newItem.id ? { ...item, id: dbId } : item,
          );
          return { plansByDate: { ...state.plansByDate, [planDate]: dateItems } };
        });
      }).catch(() => {
        // Rollback
        set((state) => {
          const dateItems = (state.plansByDate[planDate] ?? []).filter((i) => i.id !== newItem.id);
          return { plansByDate: { ...state.plansByDate, [planDate]: dateItems } };
        });
        showSaveError(() => {
          get().addPlanItem(taskId, planDate, startTime, endTime);
        });
      });
    }

    return newItem;
  },

  batchAddPlanItems: (planDate, items) => {
    if (!isValidDate(planDate) || items.length === 0) return [];

    const existing = get().plansByDate[planDate] ?? [];
    const existingTaskIds = new Set(existing.map((i) => i.taskId));
    const now = new Date().toISOString();
    const newItems: PlannedTaskItem[] = [];
    let orderStart = existing.length;

    for (const item of items) {
      if (!item.taskId.trim() || !isValidTime(item.startTime) || !isValidTime(item.endTime)) continue;
      if (existingTaskIds.has(item.taskId)) continue;
      newItems.push({
        id: uid('plan_'),
        taskId: item.taskId,
        planDate,
        startTime: item.startTime,
        endTime: item.endTime,
        order: orderStart++,
        createdAt: now,
        updatedAt: now,
      });
      existingTaskIds.add(item.taskId);
    }

    if (newItems.length === 0) return [];

    // Optimistic update
    set((state) => {
      const dateItems = [...(state.plansByDate[planDate] ?? []), ...newItems];
      return { plansByDate: { ...state.plansByDate, [planDate]: dateItems } };
    });

    // Persist (skip for guests)
    if (!isGuestUser()) {
      plannerPersistence.createMany(newItems).then((idMap) => {
        // Replace client IDs with DB IDs
        set((state) => {
          const dateItems = (state.plansByDate[planDate] ?? []).map((item) => {
            const dbId = idMap.get(item.id);
            return dbId ? { ...item, id: dbId } : item;
          });
          return { plansByDate: { ...state.plansByDate, [planDate]: dateItems } };
        });
      }).catch(() => {
        // Rollback all new items
        const newIds = new Set(newItems.map((i) => i.id));
        set((state) => {
          const dateItems = (state.plansByDate[planDate] ?? []).filter((i) => !newIds.has(i.id));
          return { plansByDate: { ...state.plansByDate, [planDate]: dateItems } };
        });
        showSaveError();
      });
    }

    return newItems;
  },

  removePlanItem: (planItemId, planDate) => {
    const removed = (get().plansByDate[planDate] ?? []).find((i) => i.id === planItemId);

    // Optimistic update
    set((state) => {
      const dateItems = (state.plansByDate[planDate] ?? [])
        .filter((i) => i.id !== planItemId)
        .map((item, idx) => ({ ...item, order: idx }));
      return { plansByDate: { ...state.plansByDate, [planDate]: dateItems } };
    });

    // Persist
    if (!isGuestUser() && removed) {
      plannerPersistence.deleteOne(planItemId).catch(() => {
        // Rollback: re-add the item
        set((state) => {
          const dateItems = [...(state.plansByDate[planDate] ?? []), removed]
            .sort((a, b) => a.order - b.order)
            .map((item, idx) => ({ ...item, order: idx }));
          return { plansByDate: { ...state.plansByDate, [planDate]: dateItems } };
        });
        showSaveError();
      });
    }
  },

  removeAllByTaskId: (taskId) => {
    const snapshot = { ...get().plansByDate };

    // Collect all items being removed (for rollback + DB delete)
    const removedItems: PlannedTaskItem[] = [];
    for (const items of Object.values(snapshot)) {
      removedItems.push(...items.filter((i) => i.taskId === taskId));
    }

    // Optimistic update
    set((state) => {
      const next: Record<string, PlannedTaskItem[]> = {};
      for (const [date, items] of Object.entries(state.plansByDate)) {
        next[date] = items
          .filter((i) => i.taskId !== taskId)
          .map((item, idx) => ({ ...item, order: idx }));
      }
      return { plansByDate: next };
    });

    // Persist
    if (!isGuestUser()) {
      Promise.all(removedItems.map((item) => plannerPersistence.deleteOne(item.id).catch(() => null))).catch(() => {
        // Rollback
        set(() => ({ plansByDate: snapshot }));
        showSaveError();
      });
    }
  },

  updatePlanItem: (planItemId, planDate, patch) => {
    if (patch.startTime !== undefined && !isValidTime(patch.startTime)) return;
    if (patch.endTime !== undefined && !isValidTime(patch.endTime)) return;

    const current = (get().plansByDate[planDate] ?? []).find((i) => i.id === planItemId);
    if (!current) return;

    // Optimistic update
    set((state) => {
      const dateItems = (state.plansByDate[planDate] ?? []).map((item) =>
        item.id === planItemId
          ? { ...item, ...patch, updatedAt: new Date().toISOString() }
          : item,
      );
      return { plansByDate: { ...state.plansByDate, [planDate]: dateItems } };
    });

    // Persist time changes only (order is client-side)
    if (!isGuestUser() && (patch.startTime || patch.endTime)) {
      plannerPersistence.updateOne(planItemId, patch, current).catch(() => {
        // Rollback
        set((state) => {
          const dateItems = (state.plansByDate[planDate] ?? []).map((item) =>
            item.id === planItemId ? current : item,
          );
          return { plansByDate: { ...state.plansByDate, [planDate]: dateItems } };
        });
        showSaveError();
      });
    }
  },

  reorderPlanItems: (planDate, orderedIds) => {
    // Reorder is purely client-side (no DB column for order).
    set((state) => {
      const current = state.plansByDate[planDate] ?? [];
      const idToItem = new Map(current.map((i) => [i.id, i]));
      const reordered: PlannedTaskItem[] = [];
      orderedIds.forEach((id, index) => {
        const item = idToItem.get(id);
        if (item) reordered.push({ ...item, order: index, updatedAt: new Date().toISOString() });
      });
      return { plansByDate: { ...state.plansByDate, [planDate]: reordered } };
    });
  },

  getPlanItemsForDate: (planDate) => {
    return get().plansByDate[planDate] ?? [];
  },
}));

// ── Today helper ──────────────────────────────────────────────────────────────
export function todayKey(): string {
  return format(new Date(), 'yyyy-MM-dd');
}
