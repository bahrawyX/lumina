import { create } from 'zustand';
import type { Task, TaskStatus, TaskPriority } from '../types/task';
import {
  isTaskPriority,
  isTaskStatus,
  normalizeDueDateString,
  normalizePersistedTasks,
} from '../utils/taskBoard';
import { useDailyPlanStore } from './useDailyPlanStore';
import * as tasksPersistence from '@/lib/persistence/tasksPersistence';
import { unlinkTaskEvent } from '@/lib/persistence/linkPersistence';
import { getStorageItem, setStorageItem } from '@/lib/storage';
import { uid } from '@/lib/uid';

const isDev = process.env.NODE_ENV === 'development';

/** Returns null when userId is unknown in production — callers must guard on null. */
function storageKey(userId: string | null): string | null {
  if (userId) return `lumina_tasks_${userId}`;
  return isDev ? 'lumina_tasks' : null;
}

function saveTasks(tasks: Task[], userId: string | null): void {
  setStorageItem(storageKey(userId), JSON.stringify(tasks));
}

function loadTasks(userId: string | null): Task[] {
  try {
    const key = storageKey(userId);
    if (!key) return [];
    const raw = getStorageItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const normalized = normalizePersistedTasks(parsed);
    if (JSON.stringify(normalized) !== raw) {
      saveTasks(normalized, userId);
    }
    return normalized;
  } catch {
    return [];
  }
}

// ── Store interface ──────────────────────────────────────────────────────────

interface TaskBoardState {
  tasks: Task[];
  dbHydrated: boolean;
  userId: string | null;

  hydrateFromDb: (tasks: Task[]) => void;
  hydrateFromDbFailed: () => void;
  setUserId: (userId: string) => void;
  addTask: (input: { title: string; description?: string; status: TaskStatus; priority?: TaskPriority; dueDate?: string | null; durationMinutes?: number }) => Task | null;
  updateTask: (id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>) => void;
  rollOverTasks: (taskIds: string[], nextDate: string) => void;
  deleteTask: (id: string) => void;
  unlinkEvent: (eventId: string) => void;
  renameContextReference: (fromContext: string, toContext: string) => void;
  clearContextReference: (context: string) => void;
  moveTask: (id: string, toStatus: TaskStatus, toIndex?: number) => void;
  reorderColumn: (status: TaskStatus, orderedIds: string[]) => void;
}

export const useTaskBoardStore = create<TaskBoardState>((set, get) => ({
  // DB is the source of truth — start empty, never read localStorage on init.
  tasks: [],
  dbHydrated: false,
  userId: null,

  setUserId: (userId) => {
    set({ userId });
  },

  hydrateFromDb: (dbTasks) => {
    if (get().dbHydrated) return;
    set({ dbHydrated: true, tasks: dbTasks });
  },

  hydrateFromDbFailed: () => {
    if (get().dbHydrated) return;
    if (isDev) {
      const fallback = loadTasks(get().userId);
      set({ dbHydrated: true, tasks: fallback });
    }
  },


  addTask: ({ title, description, status, priority = 'medium', dueDate, durationMinutes }) => {
    const trimmed = title.trim();
    if (!trimmed) return null;

    const nextStatus = isTaskStatus(status) ? status : 'todo';
    const nextPriority = isTaskPriority(priority) ? priority : 'medium';

    const now = new Date().toISOString();
    const columnTasks = get().tasks.filter(t => t.status === nextStatus);
    const maxOrder = columnTasks.length > 0
      ? Math.max(...columnTasks.map(t => t.order))
      : -1;

    const task: Task = {
      id: uid(),
      title: trimmed,
      description: description?.trim() || undefined,
      context: null,
      status: nextStatus,
      priority: nextPriority,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
      dueDate: normalizeDueDateString(dueDate),
      durationMinutes: durationMinutes ?? 30,
      linkedEventId: null,
      scheduledStart: null,
      scheduledEnd: null,
      remainingFocusTime: null,
    };

    set((state) => {
      const next = [...state.tasks, task];
      saveTasks(next, state.userId);
      return { tasks: next };
    });
    // Fire-and-forget DB persistence
    tasksPersistence.createOne(task);
    return task;
  },

  updateTask: (id, patch) => {
    set((state) => {
      const existing = state.tasks.find(t => t.id === id);
      if (!existing) return state;

      const nextTitle = patch.title !== undefined ? patch.title.trim() : existing.title;
      if (!nextTitle) return state;

      const nextStatus = patch.status !== undefined && isTaskStatus(patch.status)
        ? patch.status
        : existing.status;
      const nextPriority = patch.priority !== undefined && isTaskPriority(patch.priority)
        ? patch.priority
        : existing.priority;
      const nextDescription = patch.description !== undefined
        ? patch.description?.trim() || undefined
        : existing.description;
      const nextContext = patch.context !== undefined
        ? patch.context?.trim() || null
        : existing.context ?? null;
      const nextDueDate = patch.dueDate !== undefined
        ? normalizeDueDateString(patch.dueDate)
        : existing.dueDate ?? null;
      const nextLinkedEventId = patch.linkedEventId !== undefined
        ? patch.linkedEventId ?? null
        : existing.linkedEventId ?? null;
      const nextScheduledStart = patch.scheduledStart !== undefined
        ? patch.scheduledStart ?? null
        : existing.scheduledStart ?? null;
      const nextScheduledEnd = patch.scheduledEnd !== undefined
        ? patch.scheduledEnd ?? null
        : existing.scheduledEnd ?? null;
      const nextRemainingFocusTime = patch.remainingFocusTime !== undefined
        ? (patch.remainingFocusTime === null ? null : Math.max(0, Math.round(patch.remainingFocusTime)))
        : existing.remainingFocusTime ?? null;
      const now = new Date().toISOString();

      if (nextStatus === existing.status) {
        const next = state.tasks.map((task) =>
          task.id === id
            ? {
                ...task,
                title: nextTitle,
                description: nextDescription,
                context: nextContext,
                priority: nextPriority,
                dueDate: nextDueDate,
                linkedEventId: nextLinkedEventId,
                scheduledStart: nextScheduledStart,
                scheduledEnd: nextScheduledEnd,
                remainingFocusTime: nextRemainingFocusTime,
                updatedAt: now,
              }
            : task
        );

        saveTasks(next, state.userId);
        return { tasks: next };
      }

      const remainingTasks = state.tasks.filter(task => task.id !== id);
      const reindexedSourceTasks = remainingTasks
        .filter(task => task.status === existing.status)
        .sort((left, right) => left.order - right.order)
        .map((task, index) => ({ ...task, order: index }));

      const nextOrder = remainingTasks
        .filter(task => task.status === nextStatus)
        .reduce((highest, task) => Math.max(highest, task.order), -1) + 1;

      const updatedTask: Task = {
        ...existing,
        title: nextTitle,
        description: nextDescription,
        context: nextContext,
        status: nextStatus,
        priority: nextPriority,
        dueDate: nextDueDate,
        linkedEventId: nextLinkedEventId,
        scheduledStart: nextScheduledStart,
        scheduledEnd: nextScheduledEnd,
        remainingFocusTime: nextRemainingFocusTime,
        order: nextOrder,
        updatedAt: now,
      };

      const otherTasks = remainingTasks.filter(task => task.status !== existing.status);
      const next = [...otherTasks, ...reindexedSourceTasks, updatedTask];

      saveTasks(next, state.userId);
      return { tasks: next };
    });
    // Fire-and-forget DB persistence after updateTask resolves
    tasksPersistence.updateOne(id, { ...patch });
  },

  rollOverTasks: (taskIds, nextDate) => {
    if (taskIds.length === 0) return;
    const taskIdSet = new Set(taskIds);
    const normalizedDueDate = normalizeDueDateString(nextDate);
    const now = new Date().toISOString();

    set((state) => {
      const next = state.tasks.map((task) => {
        if (!taskIdSet.has(task.id)) return task;
        return {
          ...task,
          dueDate: normalizedDueDate,
          updatedAt: now,
        };
      });

      saveTasks(next, state.userId);
      return { tasks: next };
    });
  },

  deleteTask: (id) => {
    const task = get().tasks.find(t => t.id === id);
    set((state) => {
      const next = state.tasks.filter(t => t.id !== id);
      saveTasks(next, state.userId);
      return { tasks: next };
    });
    // Clean up any planner items referencing this task across all dates
    useDailyPlanStore.getState().removeAllByTaskId(id);
    // Fire-and-forget DB persistence
    tasksPersistence.deleteOne(id);
    // Clean up linked calendar event (lazy import to avoid circular dep)
    if (task?.linkedEventId) {
      import('./useCalendarEventsStore').then(({ useCalendarEventsStore }) =>
        useCalendarEventsStore.getState().deleteEvent(task.linkedEventId!)
      );
    }
  },

  unlinkEvent: (eventId) => {
    const affectedIds: string[] = [];
    set((state) => {
      const next = state.tasks.map((task) => {
        if (task.linkedEventId === eventId) {
          affectedIds.push(task.id);
          return { ...task, linkedEventId: null, updatedAt: new Date().toISOString() };
        }
        return task;
      });
      saveTasks(next, state.userId);
      return { tasks: next };
    });
    // Atomic DB unlink for each affected task
    affectedIds.forEach((taskId) => {
      unlinkTaskEvent(taskId, eventId);
    });
  },

  renameContextReference: (fromContext, toContext) => {
    set((state) => {
      const now = new Date().toISOString();
      const next = state.tasks.map((task) =>
        task.context === fromContext
          ? { ...task, context: toContext, updatedAt: now }
          : task
      );
      saveTasks(next, state.userId);
      return { tasks: next };
    });
  },

  clearContextReference: (context) => {
    set((state) => {
      const now = new Date().toISOString();
      const next = state.tasks.map((task) =>
        task.context === context
          ? { ...task, context: null, updatedAt: now }
          : task
      );
      saveTasks(next, state.userId);
      return { tasks: next };
    });
  },

  moveTask: (id, toStatus, toIndex) => {
    set((state) => {
      const task = state.tasks.find(t => t.id === id);
      if (!task) return state;

      // Tasks in destination column (excluding the moved task), sorted by order
      const destTasks = state.tasks
        .filter(t => t.status === toStatus && t.id !== id)
        .sort((a, b) => a.order - b.order);

      // Insert at position
      const insertAt = toIndex !== undefined
        ? Math.max(0, Math.min(toIndex, destTasks.length))
        : destTasks.length;

      destTasks.splice(insertAt, 0, { ...task, status: toStatus });

      // Reassign contiguous order values for destination column
      const updatedDest = destTasks.map((t, i) => ({ ...t, order: i, updatedAt: new Date().toISOString() }));

      // Rebuild all tasks: keep non-destination tasks, replace destination tasks
      const otherTasks = state.tasks.filter(t => t.status !== toStatus && t.id !== id);
      // Also re-normalise the source column if status changed
      const sourceStatus = task.status;
      let finalTasks: Task[];

      if (sourceStatus === toStatus) {
        // Same-column move is handled by reorderColumn — should not land here,
        // but be safe anyway
        finalTasks = [
          ...state.tasks.filter(t => t.status !== toStatus),
          ...updatedDest,
        ];
      } else {
        // Cross-column: renormalise source column too
        const srcTasks = state.tasks
          .filter(t => t.status === sourceStatus && t.id !== id)
          .sort((a, b) => a.order - b.order)
          .map((t, i) => ({ ...t, order: i }));

        finalTasks = [
          ...otherTasks.filter(t => t.status !== sourceStatus),
          ...srcTasks,
          ...updatedDest,
        ];
      }

      saveTasks(finalTasks, state.userId);
      return { tasks: finalTasks };
    });
    // Fire-and-forget DB persistence for the moved task — commit-time only
    const movedTask = get().tasks.find(t => t.id === id);
    if (movedTask) tasksPersistence.updateOne(id, { status: toStatus, order: movedTask.order });
  },

  reorderColumn: (status, orderedIds) => {
    set((state) => {
      const idSet = new Set(orderedIds);
      const otherTasks = state.tasks.filter(t => t.status !== status || !idSet.has(t.id));
      const taskMap = new Map(state.tasks.map(t => [t.id, t]));
      const now = new Date().toISOString();

      const reordered = orderedIds
        .map(id => taskMap.get(id))
        .filter(Boolean)
        .map((t, i) => ({ ...t!, status, order: i, updatedAt: now }));

      const next = [...otherTasks, ...reordered];
      saveTasks(next, state.userId);
      return { tasks: next };
    });
    // Fire-and-forget DB persistence for reordered tasks — commit-time only
    const updated = get().tasks.filter(t => t.status === status);
    updated.forEach(t => tasksPersistence.updateOne(t.id, { order: t.order }));
  },
}));

// ── Selectors (stable references, no inline derivation in components) ────────

export const selectTasksByStatus = (status: TaskStatus) => (state: TaskBoardState) =>
  state.tasks
    .filter(t => t.status === status)
    .sort((a, b) => a.order - b.order);

export const selectAllTasks = (state: TaskBoardState) => state.tasks;
