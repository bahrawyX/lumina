'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import type { CalendarEvent } from '../../types';
import type { Task, TaskPriority, TaskStatus } from '../../types/task';
import { COLUMNS } from '../../types/task';
import { EVENT_COLORS } from '../../constants';
import { addMinutesToTime } from '../../utils/taskBoard';
import { scheduleTask, DEFAULT_DURATION_MINS } from '../../utils/scheduling/scheduleTask';
import { useDailyPlanStore } from '../../store/useDailyPlanStore';
import { useToastStore } from '../../store/useToastStore';
import { expandRecurrences } from '../../utils/dateUtils';
import { TIMELINE_START_HOUR, TIMELINE_END_HOUR } from '../../utils/dailyPlanUtils';
import { format } from 'date-fns';
import { uid } from '../../lib/uid';
import notify from '../../utils/notify';
import { TaskColumn } from './TaskColumn';
import { TaskCard } from './TaskCard';
import { TaskDialog, TaskDialogPayload } from './TaskDialog';
import { TaskScheduleDialog, TaskSchedulePayload } from './TaskScheduleDialog';
import { Button } from '../ui/button';
import { useFocusStore } from '../../store/useFocusStore';

// ── Plus icon ─────────────────────────────────────────────────────────────────

const PlusIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
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
  const addEvent      = useCalendarEventsStore(s => s.addEvent);
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
  const columnTasks = useMemo<Record<TaskStatus, Task[]>>(() => {
    const map: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] };
    tasks.forEach(t => { map[t.status].push(t); });
    map.todo  = map.todo.sort((a, b) => a.order - b.order);
    map.doing = map.doing.sort((a, b) => a.order - b.order);
    map.done  = map.done.sort((a, b) => a.order - b.order);
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
          addEvent({
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
        }
      }
    } else {
      const createdTask = addTask(payload);

      if (createdTask && hasManualTimes) {
        const startTime = payload.startTime as string;
        const endTime = payload.endTime as string;
        const eventId = uid('ev_');

        addEvent({
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

        // Auto-add to today's daily plan
        if (scheduleDate === format(new Date(), 'yyyy-MM-dd')) {
          addPlanItem(createdTask.id, scheduleDate, startTime, endTime);
        }
      }
    }
    closeDialog();
  }, [editingTask, linkedEvents, updateEvent, addEvent, timezone, updateTask, addTask, closeDialog, addPlanItem]);

  const handleDelete = useCallback((id: string) => {
    deleteTask(id);
  }, [deleteTask]);

  const handlePriorityChange = useCallback((task: Task, priority: TaskPriority) => {
    if (task.priority === priority) return;
    updateTask(task.id, { priority });
  }, [updateTask]);

  const router = useRouter();
  const startFocusSession = useFocusStore((s) => s.startSession);
  const handleFocus = useCallback((task: Task) => {
    if (task.status === 'todo') {
      updateTask(task.id, { status: 'doing' });
    }
    const defaultFocusTime = 25 * 60;
    const initialTime = task.remainingFocusTime && task.remainingFocusTime > 0
      ? task.remainingFocusTime
      : defaultFocusTime;
    startFocusSession(task.id, task.title, initialTime);
    router.push('/focus');
  }, [startFocusSession, router, updateTask]);

  const handleAutoSchedule = useCallback((task: Task) => {
    const { addToast, removeToast } = useToastStore.getState();

    const today = format(new Date(), 'yyyy-MM-dd');

    // Guard: already on today's timeline
    const alreadyPlanned = getPlanItemsForDate(today).some(pi => pi.taskId === task.id);
    if (alreadyPlanned) {
      notify(`"${task.title}" is already scheduled for today`);
      return;
    }

    // Show "Scheduling…" indicator
    const loadingId = addToast({ message: `Scheduling "${task.title}"…`, duration: 30000 });
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

    removeToast(loadingId);

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
      addEvent({
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
    }

    notify(`✓ "${task.title}" scheduled at ${result.startTime}`);
  }, [events, addPlanItem, getPlanItemsForDate, linkedEvents, updateEvent, updateTask, addEvent, timezone]);

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
      addEvent({
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
    }

    closeScheduleDialog();
  }, [schedulingTask, linkedEvents, updateEvent, updateTask, addEvent, timezone, closeScheduleDialog]);

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
      {/* Board header */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground tracking-[-0.02em]">
            Task Board
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {tasks.length === 0 ? 'No tasks yet — create one to get started' : `${tasks.length} task${tasks.length !== 1 ? 's' : ''} across ${COLUMNS.length} columns`}
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => openCreateDialog('todo')}
          className="gap-1.5 rounded-xl h-8 text-xs"
          aria-label="Create new task"
        >
          <PlusIcon />
          New Task
        </Button>
      </div>

      {/* Board columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex gap-3 h-full overflow-x-auto overflow-y-hidden pb-4 items-start no-scrollbar snap-x snap-mandatory px-1 md:px-0">
          {COLUMNS.map(col => (
            <motion.div
              key={col.id}
              layout
              className="w-[85vw] snap-center shrink-0 md:w-auto md:snap-none md:shrink md:flex-1 min-w-[260px] max-w-[340px] flex flex-col h-full"
            >
              <TaskColumn
                id={col.id}
                label={col.label}
                tasks={columnTasks[col.id]}
                linkedEvents={linkedEvents}
                isDragOver={overId !== null && findContainerForId(overId, tasks) === col.id && activeTask?.status !== col.id}
                onPriorityChange={handlePriorityChange}
                onAddTask={openCreateDialog}
                onEditTask={openEditDialog}
                onScheduleTask={openScheduleDialog}
                onAutoScheduleTask={handleAutoSchedule}
                onDeleteTask={handleDelete}
                onFocusTask={handleFocus}
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
              onEdit={() => {}}
              onSchedule={() => {}}
              onAutoSchedule={() => {}}
              onDelete={() => {}}
              onFocus={() => {}}
              isDragOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Task dialog (create / edit) */}
      <TaskDialog
        open={dialogOpen}
        task={editingTask}
        linkedEvent={editingTask?.linkedEventId ? linkedEvents[editingTask.linkedEventId] ?? null : null}
        defaultStatus={defaultStatus}
        onSave={handleSave}
        onClose={closeDialog}
      />

      <TaskScheduleDialog
        open={scheduleOpen}
        task={schedulingTask}
        linkedEvent={schedulingTask?.linkedEventId ? linkedEvents[schedulingTask.linkedEventId] ?? null : null}
        onSchedule={handleSchedule}
        onClose={closeScheduleDialog}
      />
    </div>
  );
};
