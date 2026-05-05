'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { motion } from 'framer-motion';
import { useCalendarStore } from '../../store/useCalendarStore';
import { useCalendarEventsStore } from '../../store/useCalendarEventsStore';
import { useTaskBoardStore } from '../../store/useTaskBoardStore';
import { useGoalsStore } from '../../store/useGoalsStore';
import type { CalendarEvent } from '../../types';
import type { Task, TaskPriority, TaskStatus, TaskDifficulty } from '../../types/task';
import { COLUMNS } from '../../types/task';
import { EVENT_COLORS } from '../../constants';
import { addMinutesToTime } from '../../utils/taskBoard';
import { scheduleTask, DEFAULT_DURATION_MINS } from '../../utils/scheduling/scheduleTask';
import { useDailyPlanStore } from '../../store/useDailyPlanStore';
import { toast as sonnerToast } from 'sonner';
import { expandRecurrences } from '../../utils/dateUtils';
import { TIMELINE_START_HOUR, TIMELINE_END_HOUR } from '../../utils/dailyPlanUtils';
import { format } from 'date-fns';
import { uid } from '../../lib/uid';
import { createLinkedEvent } from '../../lib/persistence/linkPersistence';
import notify from '../../utils/notify';
import { TaskColumn } from './TaskColumn';
import { TaskCard } from './TaskCard';
import type { TaskDialogPayload } from './TaskDialog';
import type { TaskSchedulePayload } from './TaskScheduleDialog';
// Dialogs are only mounted when the user opens them — keep them out of
// the initial bundle. React.lazy + Suspense does the split.
const TaskDialog = React.lazy(() =>
  import('./TaskDialog').then(m => ({ default: m.TaskDialog })),
);
const TaskScheduleDialog = React.lazy(() =>
  import('./TaskScheduleDialog').then(m => ({ default: m.TaskScheduleDialog })),
);
import { TaskListView } from './TaskListView';
import { AnimatePresence } from 'framer-motion';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useFocusStore } from '../../store/useFocusStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Button } from '../ui/button';
import { Skeleton as SkeletonPrimitive } from '../ui/skeleton';
import { Skeleton } from 'boneyard-js/react';
import { useCoinsStore, selectActiveCosmetics } from '../../store/useCoinsStore';
import { triggerConfetti } from '../ui/ConfettiEffect';
import { showCoinToast } from '../../lib/coins/showCoinToast';
import { TaskFilterBar } from './TaskFilterBar';
import { filterTasks, hasActiveFilters } from '../../utils/taskFilters';

// ── Plus icon ─────────────────────────────────────────────────────────────────

const PlusIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const KanbanIcon: React.FC = () => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="18" rx="1.5" /><rect x="14" y="3" width="7" height="12" rx="1.5" />
  </svg>
);

const ListIcon: React.FC = () => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Given an id, find which column it belongs to (card id OR column id). */
function findContainerForId(id: string, tasks: Task[]): TaskStatus | null {
  // Is it a column id directly?
  if (COLUMNS.some(c => c.id === id)) return id as TaskStatus;
  // Is it a task id?
  const task = tasks.find(t => t.id === id);
  return task ? task.status : null;
}

// ── Main board ────────────────────────────────────────────────────────────────

export const TaskBoard: React.FC = () => {
  const events        = useCalendarEventsStore(s => s.events);
  const addEventOptimistic = useCalendarEventsStore(s => s.addEventOptimistic);
  const updateEvent   = useCalendarEventsStore(s => s.updateEvent);
  const timezone      = useCalendarStore(s => s.timezone);

  const tasks         = useTaskBoardStore(s => s.tasks);
  const addTask       = useTaskBoardStore(s => s.addTask);
  const updateTask    = useTaskBoardStore(s => s.updateTask);
  const deleteTask    = useTaskBoardStore(s => s.deleteTask);
  const moveTask      = useTaskBoardStore(s => s.moveTask);
  const reorderColumn = useTaskBoardStore(s => s.reorderColumn);

  const addPlanItem   = useDailyPlanStore(s => s.addPlanItem);
  const getPlanItemsForDate = useDailyPlanStore(s => s.getPlanItemsForDate);

  // ── View mode ──────────────────────────────────────────────────────────────
  const storedViewMode = useTaskBoardStore(s => s.viewMode);
  const setViewMode = useTaskBoardStore(s => s.setViewMode);
  // Kanban columns (260px min × 4) don't fit on a 412px mobile viewport.
  // Force list mode when viewport is under md (768px) — the user's choice
  // is preserved in the store and re-applies on desktop. We also hide the
  // kanban/list toggle on mobile since the choice is forced.
  const isMobile = useIsMobile();
  const viewMode = isMobile ? 'list' : storedViewMode;

  // Detect `npx boneyard-js build` — when true, we render BOTH the kanban
  // and list branches (list offscreen) so the CLI can snapshot both Skeletons.
  const [isBoneyardBuild, setIsBoneyardBuild] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as unknown as { __BONEYARD_BUILD?: boolean }).__BONEYARD_BUILD) {
      setIsBoneyardBuild(true);
    }
  }, []);

  // ── Focus time map (taskId → total seconds) ────────────────────────────────
  const focusSessions = useFocusStore(s => s.sessionHistory);
  const focusTimeMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    focusSessions.forEach(s => {
      map[s.taskId] = (map[s.taskId] ?? 0) + s.duration;
    });
    return map;
  }, [focusSessions]);

  // ── Hydration guard — prevents SSR mismatch flash ─────────────────────────
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ── Dialog state (local: no global store needed) ───────────────────────────
  const [dialogOpen, setDialogOpen]       = useState(false);
  const [editingTask, setEditingTask]     = useState<Task | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('todo');
  const [scheduleOpen, setScheduleOpen]   = useState(false);
  const [schedulingTask, setSchedulingTask] = useState<Task | null>(null);

  // ── Drag state (entirely local — never in global store) ────────────────────
  const [activeTask, setActiveTask]   = useState<Task | null>(null);
  // optimistic column state: maps status → ordered task ids
  // used ONLY during drag to give smooth visual feedback
  const [overId, setOverId]           = useState<string | null>(null);
  // Local optimistic snapshot of orderings, built during dragOver for previews
  const optimisticRef = useRef<Map<TaskStatus, string[]>>(new Map());

  // ── Sensors ───────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ── Per-column stable sorted id arrays (for SortableContext) ─────────────
  // Filter state
  const searchQuery = useTaskBoardStore(s => s.searchQuery);
  const priorityFilter = useTaskBoardStore(s => s.priorityFilter);
  const difficultyFilter = useTaskBoardStore(s => s.difficultyFilter);
  const dueDateFilter = useTaskBoardStore(s => s.dueDateFilter);
  const filtersActive = hasActiveFilters(searchQuery, priorityFilter, difficultyFilter, dueDateFilter);

  // Goal filter (?goal=<uuid>) — Goal-Driven Work uses this to scope the
  // board to a single goal's tasks when the user clicks "View tasks ↗" on
  // a goal card. Cleared by stripping the param from the URL.
  const goalFilterRouter = useRouter();
  const searchParams = useSearchParams();
  const goalIdFilter = searchParams?.get('goal') ?? null;
  // Subscribe to the stable goals array (Zustand returns the same reference
  // unless the array changes), then derive the matched goal in render —
  // a selector that returns `find()` on every snapshot trips React's
  // useSyncExternalStore loop guard.
  const allGoalsForFilter = useGoalsStore(s => s.goals);
  const goalForFilter = goalIdFilter
    ? allGoalsForFilter.find(g => g.id === goalIdFilter) ?? null
    : null;
  const clearGoalFilter = useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.delete('goal');
    const qs = params.toString();
    goalFilterRouter.replace(`/tasks${qs ? `?${qs}` : ''}`);
  }, [goalFilterRouter, searchParams]);

  // Only root tasks (no parent) appear in kanban columns, with filters applied
  const columnTasks = useMemo<Record<TaskStatus, Task[]>>(() => {
    const map: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] };
    let rootTasks = tasks.filter(t => !t.parentTaskId);
    if (goalIdFilter) {
      rootTasks = rootTasks.filter(t => t.goalId === goalIdFilter);
    }
    const filtered = filtersActive
      ? filterTasks(rootTasks, tasks, searchQuery, priorityFilter, difficultyFilter, dueDateFilter)
      : rootTasks;
    filtered.forEach(t => { map[t.status].push(t); });
    map.todo  = map.todo.sort((a, b) => a.order - b.order);
    map.doing = map.doing.sort((a, b) => a.order - b.order);
    map.done  = map.done.sort((a, b) => a.order - b.order);
    return map;
  }, [tasks, filtersActive, searchQuery, priorityFilter, difficultyFilter, dueDateFilter, goalIdFilter]);

  // Totals for results count line
  const totalRootTasks = useMemo(() => tasks.filter(t => !t.parentTaskId).length, [tasks]);
  const totalFiltered = columnTasks.todo.length + columnTasks.doing.length + columnTasks.done.length;

  // Pre-compute subtask lookup map (parentId → children)
  const subtaskMap = useMemo<Record<string, Task[]>>(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach(t => {
      if (t.parentTaskId) {
        (map[t.parentTaskId] ??= []).push(t);
      }
    });
    return map;
  }, [tasks]);

  const linkedEvents = useMemo<Record<string, CalendarEvent | undefined>>(() => {
    const map: Record<string, CalendarEvent | undefined> = {};
    events.forEach((event) => {
      map[event.id] = event;
    });
    return map;
  }, [events]);

  // ── Dialog handlers ────────────────────────────────────────────────────────

  const openCreateDialog = useCallback((status: TaskStatus = 'todo') => {
    setEditingTask(null);
    setDefaultStatus(status);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((task: Task) => {
    setEditingTask(task);
    setDefaultStatus(task.status);
    setDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingTask(null);
  }, []);

  const openScheduleDialog = useCallback((task: Task) => {
    setSchedulingTask(task);
    setScheduleOpen(true);
  }, []);

  const closeScheduleDialog = useCallback(() => {
    setScheduleOpen(false);
    setSchedulingTask(null);
  }, []);

  const handleSave = useCallback((payload: TaskDialogPayload) => {
    const scheduleDate = payload.dueDate ?? format(new Date(), 'yyyy-MM-dd');
    const hasManualTimes = Boolean(payload.startTime && payload.endTime);

    if (editingTask) {
      updateTask(editingTask.id, payload);

      if (hasManualTimes) {
        const startTime = payload.startTime as string;
        const endTime = payload.endTime as string;
        const linkedEvent = editingTask.linkedEventId
          ? linkedEvents[editingTask.linkedEventId] ?? null
          : null;

        if (linkedEvent) {
          updateEvent({
            ...linkedEvent,
            title: payload.title,
            description: payload.description ?? '',
            category: 'Focus',
            color: EVENT_COLORS.Focus,
            date: scheduleDate,
            startTime,
            endTime,
            linkedTaskId: editingTask.id,
            source: 'lumina',
          });
          updateTask(editingTask.id, {
            dueDate: scheduleDate,
            scheduledStart: startTime,
            scheduledEnd: endTime,
          });
        } else {
          const eventId = uid('ev_');
          addEventOptimistic({
            id: eventId,
            title: payload.title,
            description: payload.description ?? '',
            category: 'Focus',
            date: scheduleDate,
            startTime,
            endTime,
            linkedTaskId: editingTask.id,
            source: 'lumina',
            timezone,
            color: EVENT_COLORS.Focus,
          });
          updateTask(editingTask.id, {
            linkedEventId: eventId,
            dueDate: scheduleDate,
            scheduledStart: startTime,
            scheduledEnd: endTime,
          });
          // Atomic: create event + link in one DB transaction
          createLinkedEvent({
            title: payload.title,
            date: scheduleDate,
            startTime,
            endTime,
            description: payload.description,
            category: 'Focus',
            color: EVENT_COLORS.Focus,
            timezone,
            taskId: editingTask.id,
          });
        }
      }
    } else {
      const createdTask = addTask(payload);

      if (createdTask && hasManualTimes) {
        const startTime = payload.startTime as string;
        const endTime = payload.endTime as string;
        const eventId = uid('ev_');

        addEventOptimistic({
          id: eventId,
          title: payload.title,
          description: payload.description ?? '',
          category: 'Focus',
          date: scheduleDate,
          startTime,
          endTime,
          linkedTaskId: createdTask.id,
          source: 'lumina',
          timezone,
          color: EVENT_COLORS.Focus,
        });

        updateTask(createdTask.id, {
          linkedEventId: eventId,
          status: createdTask.status === 'todo' ? 'doing' : createdTask.status,
          dueDate: scheduleDate,
          scheduledStart: startTime,
          scheduledEnd: endTime,
        });

        // Atomic: create event + link in one DB transaction
        createLinkedEvent({
          title: payload.title,
          date: scheduleDate,
          startTime,
          endTime,
          description: payload.description,
          category: 'Focus',
          color: EVENT_COLORS.Focus,
          timezone,
          taskId: createdTask.id,
        });

        // Auto-add to today's daily plan
        if (scheduleDate === format(new Date(), 'yyyy-MM-dd')) {
          addPlanItem(createdTask.id, scheduleDate, startTime, endTime);
        }
      }
    }
    closeDialog();
  }, [editingTask, linkedEvents, updateEvent, addEventOptimistic, timezone, updateTask, addTask, closeDialog, addPlanItem]);

  const handleDelete = useCallback((id: string) => {
    // Warn if task has descendants
    const descendantCount = tasks.filter(t => {
      const collect = (pid: string): boolean => {
        if (t.parentTaskId === pid) return true;
        return tasks.some(c => c.parentTaskId === pid && collect(c.id));
      };
      return collect(id);
    }).length;
    // TODO: Could add a confirmation dialog for descendantCount > 0
    deleteTask(id);
  }, [deleteTask, tasks]);

  const addSubtask = useTaskBoardStore(s => s.addSubtask);

  const handleAddSubtask = useCallback((parentId: string, title: string) => {
    addSubtask(parentId, { title });
  }, [addSubtask]);

  // ── Confetti + coin toast on task completion ─────────────────────────────
  const activeCosmetics = useCoinsStore(selectActiveCosmetics);

  const onTaskCompleted = useCallback((task: Task) => {
    // Confetti if owned + active
    if (activeCosmetics.confetti) void triggerConfetti();
    // Show the estimated-base toast for instant feedback. The authoritative
    // balance update is performed server-side in the task PATCH handler,
    // which pushes the true value back via coins persistence — we no longer
    // increment the local balance here (N3: avoid double-award / drift).
    const base = task.difficulty === 'hard' ? 10 : 5;
    showCoinToast(base, task.difficulty === 'hard' ? 'Hard task completed' : 'Task completed');
  }, [activeCosmetics.confetti]);

  const handleToggleSubtaskDone = useCallback((taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    updateTask(taskId, { status: newStatus });
    if (newStatus === 'done') onTaskCompleted(task);
  }, [tasks, updateTask, onTaskCompleted]);

  const handleMarkParentDone = useCallback((taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    updateTask(taskId, { status: 'done' });
    if (task) onTaskCompleted(task);
  }, [tasks, updateTask, onTaskCompleted]);

  const handleStatusChange = useCallback((taskId: string, status: TaskStatus) => {
    updateTask(taskId, { status });
    if (status === 'done') {
      const task = tasks.find(t => t.id === taskId);
      if (task) onTaskCompleted(task);
    }
  }, [tasks, updateTask, onTaskCompleted]);

  const handlePriorityChange = useCallback((task: Task, priority: TaskPriority) => {
    if (task.priority === priority) return;
    updateTask(task.id, { priority });
  }, [updateTask]);

  const handleDifficultyChange = useCallback((task: Task, difficulty: TaskDifficulty) => {
    if (task.difficulty === difficulty) return;
    updateTask(task.id, { difficulty });
  }, [updateTask]);

  const router = useRouter();
  const startFocusSession = useFocusStore((s) => s.startSession);
  const preferredFocusMinutes = useSettingsStore((s) => s.focusSessionLength);
  const handleFocus = useCallback((task: Task) => {
    if (task.status === 'todo') {
      updateTask(task.id, { status: 'doing' });
    }
    const defaultFocusTime = preferredFocusMinutes * 60;
    const initialTime = task.remainingFocusTime && task.remainingFocusTime > 0
      ? task.remainingFocusTime
      : defaultFocusTime;
    startFocusSession(task.id, task.title, initialTime);
    router.push('/focus');
  }, [preferredFocusMinutes, startFocusSession, router, updateTask]);

  const handleAutoSchedule = useCallback((task: Task) => {
    const today = format(new Date(), 'yyyy-MM-dd');

    // Guard: already on today's timeline
    const alreadyPlanned = getPlanItemsForDate(today).some(pi => pi.taskId === task.id);
    if (alreadyPlanned) {
      notify(`"${task.title}" is already scheduled for today`);
      return;
    }

    // Show "Scheduling…" indicator
    const loadingId = sonnerToast.loading(`Scheduling "${task.title}"…`);
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const durationMins = task.durationMinutes ?? DEFAULT_DURATION_MINS;

    // Build today's calendar event list
    const allInstances = expandRecurrences(events, new Date(today), new Date(today));
    const todayCalItems = allInstances
      .filter(ev => ev.instanceDate === today)
      .map(ev => ({ id: ev.id, startTime: ev.startTime, endTime: ev.endTime }));

    // Build today's plan items list
    const todayPlanItems = getPlanItemsForDate(today)
      .map(pi => ({ id: pi.id, startTime: pi.startTime, endTime: pi.endTime }));

    const dayStart = TIMELINE_START_HOUR * 60;
    const dayEnd = TIMELINE_END_HOUR * 60;
    const result = scheduleTask(durationMins, todayCalItems, todayPlanItems, nowMins, dayStart, dayEnd);

    sonnerToast.dismiss(loadingId);

    if (!result.ok) {
      if ('reason' in result && result.reason === 'task_too_long') {
        notify(`No slot long enough for "${task.title}" (need ${durationMins} min)`);
      } else {
        notify('No free time available today');
      }
      return;
    }

    addPlanItem(task.id, today, result.startTime, result.endTime);

    const linkedEvent = task.linkedEventId
      ? linkedEvents[task.linkedEventId] ?? null
      : null;

    if (linkedEvent) {
      updateEvent({
        ...linkedEvent,
        title: task.title,
        description: task.description ?? '',
        category: 'Focus',
        color: EVENT_COLORS.Focus,
        date: today,
        startTime: result.startTime,
        endTime: result.endTime,
        linkedTaskId: task.id,
        source: 'lumina',
      });
      updateTask(task.id, {
        status: task.status === 'todo' ? 'doing' : task.status,
        dueDate: today,
        linkedEventId: linkedEvent.id,
        scheduledStart: result.startTime,
        scheduledEnd: result.endTime,
      });
    } else {
      const eventId = uid('ev_');
      addEventOptimistic({
        id: eventId,
        title: task.title,
        description: task.description ?? '',
        category: 'Focus',
        date: today,
        startTime: result.startTime,
        endTime: result.endTime,
        linkedTaskId: task.id,
        source: 'lumina',
        timezone,
        color: EVENT_COLORS.Focus,
      });
      updateTask(task.id, {
        status: task.status === 'todo' ? 'doing' : task.status,
        dueDate: today,
        linkedEventId: eventId,
        scheduledStart: result.startTime,
        scheduledEnd: result.endTime,
      });
      // Atomic: create event + link in one DB transaction
      createLinkedEvent({
        title: task.title,
        date: today,
        startTime: result.startTime,
        endTime: result.endTime,
        description: task.description ?? undefined,
        category: 'Focus',
        color: EVENT_COLORS.Focus,
        timezone,
        taskId: task.id,
      });
    }

    notify(`✓ "${task.title}" scheduled at ${result.startTime}`);
  }, [events, addPlanItem, getPlanItemsForDate, linkedEvents, updateEvent, updateTask, addEventOptimistic, timezone]);

  const handleSchedule = useCallback((payload: TaskSchedulePayload) => {
    if (!schedulingTask) return;

    const linkedEvent = schedulingTask.linkedEventId
      ? linkedEvents[schedulingTask.linkedEventId] ?? null
      : null;
    const endTime = addMinutesToTime(payload.startTime, payload.durationMinutes);

    if (linkedEvent) {
      updateEvent({
        ...linkedEvent,
        title: schedulingTask.title,
        description: schedulingTask.description ?? '',
        category: 'Focus',
        color: EVENT_COLORS.Focus,
        date: payload.date,
        startTime: payload.startTime,
        endTime,
        linkedTaskId: schedulingTask.id,
        source: 'lumina',
      });
      updateTask(schedulingTask.id, {
        linkedEventId: linkedEvent.id,
        dueDate: payload.date,
        scheduledStart: payload.startTime,
        scheduledEnd: endTime,
      });
    } else {
      const eventId = uid('ev_');
      addEventOptimistic({
        id: eventId,
        title: schedulingTask.title,
        description: schedulingTask.description ?? '',
        category: 'Focus',
        date: payload.date,
        startTime: payload.startTime,
        endTime,
        linkedTaskId: schedulingTask.id,
        source: 'lumina',
        timezone,
        color: EVENT_COLORS.Focus,
      });
      updateTask(schedulingTask.id, {
        linkedEventId: eventId,
        status: schedulingTask.status === 'todo' ? 'doing' : schedulingTask.status,
        dueDate: payload.date,
        scheduledStart: payload.startTime,
        scheduledEnd: endTime,
      });
      // Atomic: create event + link in one DB transaction
      createLinkedEvent({
        title: schedulingTask.title,
        date: payload.date,
        startTime: payload.startTime,
        endTime,
        description: schedulingTask.description ?? undefined,
        category: 'Focus',
        color: EVENT_COLORS.Focus,
        timezone,
        taskId: schedulingTask.id,
      });
    }

    closeScheduleDialog();
  }, [schedulingTask, linkedEvents, updateEvent, updateTask, addEventOptimistic, timezone, closeScheduleDialog]);

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = tasks.find(t => t.id === event.active.id);
    if (task) {
      setActiveTask(task);
      // Seed optimistic state from current order
      COLUMNS.forEach(col => {
        optimisticRef.current.set(
          col.id,
          columnTasks[col.id].map(t => t.id)
        );
      });
    }
  }, [tasks, columnTasks]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOverId(String(over.id));

    const activeContainer = findContainerForId(String(active.id), tasks);
    const overContainer   = findContainerForId(String(over.id),   tasks);

    if (!activeContainer || !overContainer) return;

    if (activeContainer !== overContainer) {
      // Compute visual preview across columns in the local ref
      const srcIds  = [...(optimisticRef.current.get(activeContainer) ?? [])];
      const destIds = [...(optimisticRef.current.get(overContainer)   ?? [])];

      const activeIdx = srcIds.indexOf(String(active.id));
      if (activeIdx === -1) return;

      // Find insertion index in destination
      const overIdx = destIds.indexOf(String(over.id));
      const insertAt = overIdx === -1 ? destIds.length : overIdx;

      srcIds.splice(activeIdx, 1);
      destIds.splice(insertAt, 0, String(active.id));

      optimisticRef.current.set(activeContainer, srcIds);
      optimisticRef.current.set(overContainer,   destIds);
    } else {
      // Same column reorder preview
      const ids    = [...(optimisticRef.current.get(activeContainer) ?? [])];
      const oldIdx = ids.indexOf(String(active.id));
      const newIdx = ids.indexOf(String(over.id));
      if (oldIdx === -1 || newIdx === -1) return;
      const reordered = arrayMove(ids, oldIdx, newIdx);
      optimisticRef.current.set(activeContainer, reordered);
    }
  }, [tasks]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    setOverId(null);

    if (!over) {
      optimisticRef.current.clear();
      return;
    }

    const activeContainer = findContainerForId(String(active.id), tasks);
    const overContainer   = findContainerForId(String(over.id),   tasks);

    if (!activeContainer || !overContainer) {
      optimisticRef.current.clear();
      return;
    }

    if (activeContainer === overContainer) {
      // Reorder within same column
      const currentIds: string[] = columnTasks[activeContainer].map(t => t.id);
      const oldIdx     = currentIds.indexOf(String(active.id));
      const overTask   = tasks.find(t => t.id === over.id);
      const newIdx     = overTask
        ? columnTasks[activeContainer].findIndex(t => t.id === over.id)
        : currentIds.length - 1;

      if (oldIdx !== newIdx && newIdx !== -1) {
        const reordered: string[] = arrayMove(currentIds, oldIdx, newIdx);
        reorderColumn(activeContainer, reordered);
      }
    } else {
      // Cross-column move
      const destIds   = optimisticRef.current.get(overContainer) ?? [];
      const insertIdx = destIds.indexOf(String(active.id));
      moveTask(String(active.id), overContainer, insertIdx === -1 ? undefined : insertIdx);
    }

    optimisticRef.current.clear();
  }, [tasks, columnTasks, reorderColumn, moveTask]);

  const handleDragCancel = useCallback(() => {
    setActiveTask(null);
    setOverId(null);
    optimisticRef.current.clear();
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Goal-Driven Work filter banner — appears when ?goal=<uuid> is set */}
      {goalIdFilter && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-xs flex-shrink-0">
          <span className="text-primary">🎯</span>
          <span className="text-foreground">
            Showing tasks for: <span className="font-semibold">{goalForFilter?.title ?? 'this goal'}</span>
          </span>
          <button
            type="button"
            onClick={clearGoalFilter}
            className="ml-auto text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
          >
            × Clear filter
          </button>
        </div>
      )}

      {/* Board header — editorial */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4 md:mb-5 pb-4 md:pb-5 border-b border-border/60 flex-shrink-0" data-tutorial="task-board-header">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 mb-1.5">
            Workspace · {viewMode === 'kanban' ? 'Board' : 'List'}
          </p>
          <h1 className="font-display text-2xl md:text-3xl font-medium text-foreground tracking-[-0.035em] leading-none">
            {viewMode === 'kanban' ? 'Task Board' : 'Tasks'}
          </h1>
          <p className="text-[11px] md:text-xs text-muted-foreground/80 mt-2 hidden sm:block tabular-nums">
            {tasks.length === 0 ? 'No tasks yet' : `${tasks.filter(t => !t.parentTaskId).length} task${tasks.filter(t => !t.parentTaskId).length !== 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle — hidden on mobile where list view is forced */}
          <div className="hidden md:flex items-center rounded-lg border border-border/50 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
                viewMode === 'kanban' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-label="Kanban view"
              title="Board view"
            >
              <KanbanIcon />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-label="List view"
              title="List view"
            >
              <ListIcon />
            </button>
          </div>

          <Button
            size="sm"
            onClick={() => openCreateDialog('todo')}
            className="gap-1.5 rounded-xl h-9 md:h-8 text-xs whitespace-nowrap"
            aria-label="Create new task"
          >
            <PlusIcon />
            New Task
          </Button>
        </div>
      </div>

      {/* Filter bar — visible in both kanban and list modes */}
      <TaskFilterBar />

      {/* Results count line */}
      <AnimatePresence initial={false}>
        {filtersActive && (
          <motion.div
            key="results-count"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="overflow-hidden flex-shrink-0"
          >
            <p className="text-xs text-muted-foreground mb-3">
              Showing {totalFiltered} of {totalRootTasks} task{totalRootTasks === 1 ? '' : 's'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Board content — Kanban or List */}
      <AnimatePresence mode="wait" initial={false}>
      {viewMode === 'kanban' ? (
        <motion.div
          key="kanban"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="flex-1 flex flex-col min-h-0"
        >
      <Skeleton
        name="tasks.TaskBoard.kanban"
        loading={!mounted}
        className="flex-1 flex flex-col min-h-0"
        fallback={
          <div className="flex gap-3 h-full overflow-hidden pb-4 items-stretch px-1 md:px-0">
            {COLUMNS.map(col => (
              <div key={col.id} className="w-[85vw] shrink-0 md:w-auto md:shrink md:flex-1 min-w-[240px] max-w-[320px] flex flex-col h-full">
                <div className="mb-3 px-1 flex items-center gap-2.5 py-1">
                  <SkeletonPrimitive className="w-2 h-2 rounded-full flex-shrink-0" />
                  <SkeletonPrimitive className="h-4 w-16 rounded-md" />
                  <SkeletonPrimitive className="ml-auto h-4 w-6 rounded-full" />
                </div>
                <div className="flex-1 rounded-2xl border border-border/50 bg-muted/20 p-1.5 flex flex-col gap-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="rounded-xl border border-border/60 bg-card p-3 flex flex-col gap-2 shadow-card">
                      <div className="flex items-start gap-2">
                        <SkeletonPrimitive className="flex-1 h-4 rounded" />
                        <SkeletonPrimitive className="h-6 w-6 rounded-lg flex-shrink-0" />
                      </div>
                      <div className="flex gap-1.5 pl-[14px]">
                        <SkeletonPrimitive className="h-4 w-14 rounded-md" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        }
      >
      {mounted && <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex gap-3 flex-1 min-h-0 overflow-x-auto overflow-y-hidden pb-4 items-stretch no-scrollbar snap-x snap-mandatory px-1 md:px-0">
          {COLUMNS.map(col => (
            <motion.div
              key={col.id}
              layout
              className="w-[85vw] snap-center shrink-0 md:w-auto md:snap-none md:shrink md:flex-1 min-w-[240px] max-w-[320px] flex flex-col h-full"
            >
              <TaskColumn
                id={col.id}
                label={col.label}
                tasks={columnTasks[col.id]}
                linkedEvents={linkedEvents}
                isDragOver={overId !== null && findContainerForId(overId, tasks) === col.id && activeTask?.status !== col.id}
                onPriorityChange={handlePriorityChange}
                onDifficultyChange={handleDifficultyChange}
                onAddTask={openCreateDialog}
                onEditTask={openEditDialog}
                onScheduleTask={openScheduleDialog}
                onAutoScheduleTask={handleAutoSchedule}
                onDeleteTask={handleDelete}
                onFocusTask={handleFocus}
                subtaskMap={subtaskMap}
                allTasks={tasks}
                onAddSubtask={handleAddSubtask}
                onToggleSubtaskDone={handleToggleSubtaskDone}
                onMarkParentDone={handleMarkParentDone}
              />
            </motion.div>
          ))}
        </div>

        {/* Drag overlay — renders the "lifted" card */}
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <TaskCard
              task={activeTask}
              linkedEvent={activeTask.linkedEventId ? linkedEvents[activeTask.linkedEventId] ?? null : null}
              onPriorityChange={handlePriorityChange}
              onDifficultyChange={handleDifficultyChange}
              onEdit={() => {}}
              onSchedule={() => {}}
              onAutoSchedule={() => {}}
              onDelete={() => {}}
              onFocus={() => {}}
              isDragOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>}
      </Skeleton>
        </motion.div>
      ) : (
        <motion.div
          key="list"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="flex-1 flex flex-col min-h-0"
        >
          <Skeleton
            name="tasks.TaskBoard.list"
            loading={!mounted}
            fallback={
              <div className="flex-1 rounded-xl border border-border/50 overflow-hidden">
                <div className="flex items-center h-8 bg-background border-b border-border px-2 gap-2">
                  <SkeletonPrimitive className="h-3 w-8" /><SkeletonPrimitive className="h-3 w-8" /><SkeletonPrimitive className="h-3 flex-1" /><SkeletonPrimitive className="h-3 w-14" /><SkeletonPrimitive className="h-3 w-14 hidden md:block" /><SkeletonPrimitive className="h-3 w-16" /><SkeletonPrimitive className="h-3 w-16" />
                </div>
                {[1,2,3,4,5,6,7,8].map(i => (
                  <div key={i} className="flex items-center h-11 border-b border-border/50 px-2 gap-3">
                    <SkeletonPrimitive className="w-4 h-4 rounded flex-shrink-0" />
                    <SkeletonPrimitive className="w-4 h-4 rounded flex-shrink-0" />
                    <SkeletonPrimitive className="h-3.5 flex-1 rounded" />
                    <SkeletonPrimitive className="h-4 w-12 rounded-md flex-shrink-0" />
                    <SkeletonPrimitive className="h-4 w-12 rounded-md flex-shrink-0 hidden md:block" />
                    <SkeletonPrimitive className="h-3 w-14 rounded flex-shrink-0" />
                    <SkeletonPrimitive className="h-5 w-16 rounded-md flex-shrink-0" />
                  </div>
                ))}
              </div>
            }
          >
          {mounted && (
            <TaskListView
              tasks={tasks}
              subtaskMap={subtaskMap}
              linkedEvents={linkedEvents}
              focusTimeMap={focusTimeMap}
              onEdit={openEditDialog}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
              onAddTask={openCreateDialog}
            />
          )}
          </Skeleton>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Offscreen renderer for the INACTIVE view during `npx boneyard-js build`.
          The CLI visits /tasks with default viewMode='kanban' and can't flip
          localStorage, so without this the tasks.TaskBoard.list Skeleton never
          mounts for snapshot. Hidden from screen readers + users. */}
      {isBoneyardBuild && viewMode === 'kanban' && mounted && (
        <div aria-hidden style={{ position: 'absolute', left: -99999, top: -99999, width: 1280, height: 720, pointerEvents: 'none' }}>
          <Skeleton
            name="tasks.TaskBoard.list"
            loading={false}
            fallback={null}
          >
            <TaskListView
              tasks={tasks}
              subtaskMap={subtaskMap}
              linkedEvents={linkedEvents}
              focusTimeMap={focusTimeMap}
              onEdit={openEditDialog}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
              onAddTask={openCreateDialog}
            />
          </Skeleton>
        </div>
      )}

      {/* Task dialog (create / edit) — lazy, only mount when open */}
      <React.Suspense fallback={null}>
        {(dialogOpen || editingTask) && (
          <TaskDialog
            open={dialogOpen}
            task={editingTask}
            linkedEvent={editingTask?.linkedEventId ? linkedEvents[editingTask.linkedEventId] ?? null : null}
            defaultStatus={defaultStatus}
            onSave={handleSave}
            onClose={closeDialog}
            subtasks={editingTask ? (subtaskMap[editingTask.id] ?? []) : []}
            onAddSubtask={handleAddSubtask}
            onToggleSubtaskDone={handleToggleSubtaskDone}
            onDeleteSubtask={handleDelete}
            onOpenSubtask={(sub) => {
              // Close current dialog, open subtask dialog
              closeDialog();
              setTimeout(() => openEditDialog(sub), 150);
            }}
          />
        )}
      </React.Suspense>

      <React.Suspense fallback={null}>
        {(scheduleOpen || schedulingTask) && (
          <TaskScheduleDialog
            open={scheduleOpen}
            task={schedulingTask}
            linkedEvent={schedulingTask?.linkedEventId ? linkedEvents[schedulingTask.linkedEventId] ?? null : null}
            onSchedule={handleSchedule}
            onClose={closeScheduleDialog}
          />
        )}
      </React.Suspense>
    </div>
  );
};
