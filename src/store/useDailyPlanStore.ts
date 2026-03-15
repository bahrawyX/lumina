import { create } from 'zustand';
import { format, parseISO, isValid } from 'date-fns';

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

  // Actions
  addPlanItem: (taskId: string, planDate: string, startTime: string, endTime: string) => PlannedTaskItem | null;
  /** Atomically add multiple plan items for a date in a single state update. Returns the created items. */
  batchAddPlanItems: (planDate: string, items: { taskId: string; startTime: string; endTime: string }[]) => PlannedTaskItem[];
  removePlanItem: (planItemId: string, planDate: string) => void;
  removeAllByTaskId: (taskId: string) => void;
  updatePlanItem: (planItemId: string, planDate: string, patch: Partial<Pick<PlannedTaskItem, 'startTime' | 'endTime' | 'order'>>) => void;
  reorderPlanItems: (planDate: string, orderedIds: string[]) => void;
  getPlanItemsForDate: (planDate: string) => PlannedTaskItem[];
}

// ── Storage ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'lumina_daily_plans';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function isValidDate(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  if (!DATE_ONLY_RE.test(v)) return false;
  const d = parseISO(v);
  return isValid(d);
}

function isValidTime(v: unknown): v is string {
  return typeof v === 'string' && TIME_RE.test(v);
}

function normalizeItem(raw: Record<string, unknown>, index: number): PlannedTaskItem | null {
  if (
    typeof raw.id !== 'string' || !raw.id.trim() ||
    typeof raw.taskId !== 'string' || !raw.taskId.trim() ||
    !isValidDate(raw.planDate) ||
    !isValidTime(raw.startTime) ||
    !isValidTime(raw.endTime)
  ) return null;

  const now = new Date().toISOString();
  return {
    id: raw.id.trim(),
    taskId: raw.taskId.trim(),
    planDate: raw.planDate,
    startTime: raw.startTime,
    endTime: raw.endTime,
    order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : index,
    createdAt: typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt)) ? raw.updatedAt : now,
  };
}

function loadPlans(): Record<string, PlannedTaskItem[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const result: Record<string, PlannedTaskItem[]> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!isValidDate(key)) continue;
      if (!Array.isArray(value)) continue;
      const items: PlannedTaskItem[] = [];
      value.forEach((entry, i) => {
        if (!entry || typeof entry !== 'object') return;
        const item = normalizeItem(entry as Record<string, unknown>, i);
        if (item) items.push(item);
      });
      items.sort((a, b) => a.order - b.order);
      // re-assign stable order
      result[key] = items.map((item, i) => ({ ...item, order: i }));
    }
    return result;
  } catch {
    return {};
  }
}

function savePlans(plans: Record<string, PlannedTaskItem[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch {
    // quota — fail silently
  }
}

// ── uid ───────────────────────────────────────────────────────────────────────

function uid(): string {
  return 'plan_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useDailyPlanStore = create<DailyPlanState>((set, get) => ({
  plansByDate: loadPlans(),

  addPlanItem: (taskId, planDate, startTime, endTime) => {
    if (!isValidDate(planDate) || !isValidTime(startTime) || !isValidTime(endTime)) return null;
    if (!taskId.trim()) return null;

    const existing = get().plansByDate[planDate] ?? [];
    // Prevent duplicate task ↔ date pairing
    if (existing.some((item) => item.taskId === taskId)) return null;

    const now = new Date().toISOString();
    const newItem: PlannedTaskItem = {
      id: uid(),
      taskId,
      planDate,
      startTime,
      endTime,
      order: existing.length,
      createdAt: now,
      updatedAt: now,
    };

    set((state) => {
      const dateItems = [...(state.plansByDate[planDate] ?? []), newItem];
      const next = { ...state.plansByDate, [planDate]: dateItems };
      savePlans(next);
      return { plansByDate: next };
    });

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
        id: uid(),
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

    set((state) => {
      const dateItems = [...(state.plansByDate[planDate] ?? []), ...newItems];
      const next = { ...state.plansByDate, [planDate]: dateItems };
      savePlans(next);
      return { plansByDate: next };
    });

    return newItems;
  },

  removePlanItem: (planItemId, planDate) => {
    set((state) => {
      const dateItems = (state.plansByDate[planDate] ?? []).filter((i) => i.id !== planItemId);
      // Re-assign order after removal
      const reordered = dateItems.map((item, idx) => ({ ...item, order: idx }));
      const next = { ...state.plansByDate, [planDate]: reordered };
      savePlans(next);
      return { plansByDate: next };
    });
  },

  removeAllByTaskId: (taskId) => {
    set((state) => {
      const next: Record<string, PlannedTaskItem[]> = {};
      for (const [date, items] of Object.entries(state.plansByDate)) {
        const filtered = items
          .filter((i) => i.taskId !== taskId)
          .map((item, idx) => ({ ...item, order: idx }));
        next[date] = filtered;
      }
      savePlans(next);
      return { plansByDate: next };
    });
  },

  updatePlanItem: (planItemId, planDate, patch) => {
    // Validate time fields in the patch before persisting
    if (patch.startTime !== undefined && !isValidTime(patch.startTime)) return;
    if (patch.endTime !== undefined && !isValidTime(patch.endTime)) return;
    set((state) => {
      const dateItems = (state.plansByDate[planDate] ?? []).map((item) =>
        item.id === planItemId
          ? { ...item, ...patch, updatedAt: new Date().toISOString() }
          : item
      );
      const next = { ...state.plansByDate, [planDate]: dateItems };
      savePlans(next);
      return { plansByDate: next };
    });
  },

  reorderPlanItems: (planDate, orderedIds) => {
    set((state) => {
      const current = state.plansByDate[planDate] ?? [];
      const idToItem = new Map(current.map((i) => [i.id, i]));
      const reordered: PlannedTaskItem[] = [];
      orderedIds.forEach((id, index) => {
        const item = idToItem.get(id);
        if (item) reordered.push({ ...item, order: index, updatedAt: new Date().toISOString() });
      });
      const next = { ...state.plansByDate, [planDate]: reordered };
      savePlans(next);
      return { plansByDate: next };
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
