'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { format } from 'date-fns';
import { addDays } from 'date-fns';
import { toast } from 'sonner';
import { CompactEmojiPicker } from '../ui/CompactEmojiPicker';

import { useCalendarStore } from '../../store/useCalendarStore';
import { useCalendarEventsStore } from '../../store/useCalendarEventsStore';
import { useTaskBoardStore } from '../../store/useTaskBoardStore';
import { useDailyPlanStore, todayKey } from '../../store/useDailyPlanStore';
import type { Task } from '../../types/task';

import {
  computePlanSummary,
  DEFAULT_TASK_DURATION_MINS,
  addMinsToTime,
  findNextFreeSlot,
  minutesToTime,
  timeToMinutes,
} from '../../utils/dailyPlanUtils';
import { HOUR_HEIGHT } from '../../utils/dateUtils';
import { autoScheduleTasks } from '../../utils/scheduling/autoScheduleTasks';
import notify from '../../utils/notify';
import { useVirtualWindow } from '../../hooks/useVirtualWindow';

import { DailyPlanHeader } from './DailyPlanHeader';
import { TodayTimeline } from './TodayTimeline';
import { TaskPoolCard, TaskPoolCardOverlay } from './TaskPoolCard';
import { FreeTimePanel } from './FreeTimePanel';
import { PlanningModal } from './PlanningModal';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Skeleton as SkeletonPrimitive } from '../ui/skeleton';
import { Skeleton } from 'boneyard-js/react';

const POOL_ROW_ESTIMATE_PX = 78;

// Pixel-to-minute conversion — must match DayCalendarTimeline (HOUR_HEIGHT / 60)
const PX_PER_MIN = HOUR_HEIGHT / 60;
// Snap resolution for drops: 5-minute grid
const DROP_SNAP_MINS = 5;

// ── Main view ─────────────────────────────────────────────────────────────────

interface DailyPlanViewProps {
  onToggleInsights?: () => void;
  insightsOpen?: boolean;
}

export const DailyPlanView: React.FC<DailyPlanViewProps> = ({ onToggleInsights, insightsOpen }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const dbHydrated = useDailyPlanStore((s) => s.dbHydrated);

  const today = todayKey();
  const todayDate = useMemo(() => new Date(), []);

  // ── Calendar store (scoped selectors) ────────────────────────────────────
  const allEvents = useCalendarEventsStore((s) => s.events);

  // ── Task board store ──────────────────────────────────────────────────────
  const allTasks = useTaskBoardStore((s) => s.tasks);
  const updateTask = useTaskBoardStore((s) => s.updateTask);
  const rollOverTasks = useTaskBoardStore((s) => s.rollOverTasks);
  const addTask = useTaskBoardStore((s) => s.addTask);
  const deleteTask = useTaskBoardStore((s) => s.deleteTask);

  // ── Daily plan store ──────────────────────────────────────────────────────
  const plansByDate = useDailyPlanStore((s) => s.plansByDate);
  const addPlanItem = useDailyPlanStore((s) => s.addPlanItem);
  const batchAddPlanItems = useDailyPlanStore((s) => s.batchAddPlanItems);
  const removePlanItem = useDailyPlanStore((s) => s.removePlanItem);
  const updatePlanItem = useDailyPlanStore((s) => s.updatePlanItem);
  const reorderPlanItems = useDailyPlanStore((s) => s.reorderPlanItems);

  // ── Derived data ──────────────────────────────────────────────────────────

  // Today's calendar events
  const todayEvents = useMemo(
    () => allEvents.filter((e) => e.date === today),
    [allEvents, today]
  );

  // Today's plan items
  const planItems = useMemo(
    () => (plansByDate[today] ?? []).slice().sort((a, b) => a.order - b.order),
    [plansByDate, today]
  );

  // Set of task ids already planned for today
  const plannedTaskIds = useMemo(
    () => new Set(planItems.map((i) => i.taskId)),
    [planItems]
  );

  // Task pool: non-done ROOT tasks not already planned (subtasks never appear in pool)
  const poolTasks = useMemo(
    () => allTasks.filter((t) => t.status !== 'done' && !t.parentTaskId && !plannedTaskIds.has(t.id)),
    [allTasks, plannedTaskIds]
  );

  // Task map for O(1) lookup
  const taskMap = useMemo(
    () => new Map<string, Task>(allTasks.map((t) => [t.id, t])),
    [allTasks]
  );

  // Summary (derived — not stored)
  const summary = useMemo(
    () => computePlanSummary(planItems, todayEvents, poolTasks.length),
    [planItems, todayEvents, poolTasks.length]
  );

  const busyRanges = useMemo(
    () => [
      ...todayEvents.map((e) => ({ startTime: e.startTime, endTime: e.endTime })),
      ...planItems.map((i) => ({ startTime: i.startTime, endTime: i.endTime })),
    ],
    [todayEvents, planItems],
  );

  // ── Auto-sync: tasks with today's due date + scheduled times → plan ─────────
  useEffect(() => {
    const todayScheduled = allTasks.filter(
      (t) =>
        t.status !== 'done' &&
        t.dueDate === today &&
        t.scheduledStart &&
        t.scheduledEnd &&
        !plannedTaskIds.has(t.id),
    );
    for (const task of todayScheduled) {
      addPlanItem(task.id, today, task.scheduledStart as string, task.scheduledEnd as string);
    }
  }, [allTasks, today, plannedTaskIds, addPlanItem]);

  // ── Drag state (local) ────────────────────────────────────────────────────
  const [activeDragTaskId, setActiveDragTaskId] = useState<string | null>(null);
  const activeDragTask = activeDragTaskId ? taskMap.get(activeDragTaskId) ?? null : null;

  // ── Auto Plan My Day ──────────────────────────────────────────────────────
  const [isPlanningDay, setIsPlanningDay] = useState(false);
  const [isRollingOver, setIsRollingOver] = useState(false);
  const [planningPhase, setPlanningPhase] = useState<'planning' | 'revealing'>('planning');
  const [revealPlanItemDelays, setRevealPlanItemDelays] = useState<Map<string, number>>(new Map());
  const [rollingOutTaskIds, setRollingOutTaskIds] = useState<Set<string>>(new Set());

  const rolloverCandidates = useMemo(
    () => allTasks.filter((task) => task.status !== 'done' && (task.dueDate === today || plannedTaskIds.has(task.id))),
    [allTasks, plannedTaskIds, today],
  );

  const visiblePlanItems = useMemo(
    () => planItems.filter((item) => !rollingOutTaskIds.has(item.taskId)),
    [planItems, rollingOutTaskIds],
  );

  const handleAutoPlanDay = useCallback(async () => {
    if (isPlanningDay || poolTasks.length === 0) return;

    setIsPlanningDay(true);
    setPlanningPhase('planning');
    setRevealPlanItemDelays(new Map());
    try {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const dayStartTime = currentTime > '09:00' ? currentTime : '09:00';

      const assignments = autoScheduleTasks(poolTasks, dayStartTime).map((item) => ({
        taskId: item.id,
        startTime: item.startTime,
        endTime: item.endTime,
      }));

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 2800);
      });

      if (assignments.length === 0) {
        notify('No unscheduled tasks fit the remaining time today.');
        return;
      }

      const added = batchAddPlanItems(today, assignments);
      if (added.length === 0) {
        notify('No unscheduled tasks fit the remaining time today.');
        return;
      }

      const revealMap = new Map<string, number>();
      added.forEach((item, idx) => {
        revealMap.set(item.id, idx * 70);
      });
      setRevealPlanItemDelays(revealMap);
      setPlanningPhase('revealing');

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 520);
      });

      const addedTaskIds = new Set(added.map((i) => i.taskId));
      for (const task of poolTasks) {
        if (addedTaskIds.has(task.id) && task.status === 'todo') {
          updateTask(task.id, { status: 'doing' });
        }
      }

      notify(`Scheduled ${added.length} task${added.length === 1 ? '' : 's'} for today \u2728`);
      setPlanningPhase('planning');
    } finally {
      setIsPlanningDay(false);
      setPlanningPhase('planning');
    }
  }, [isPlanningDay, poolTasks, today, batchAddPlanItems, updateTask]);

  const handleRollOverTasks = useCallback(async () => {
    if (isRollingOver || rolloverCandidates.length === 0) return;

    const tomorrow = format(addDays(new Date(today), 1), 'yyyy-MM-dd');
    const taskIds = rolloverCandidates.map((task) => task.id);
    const taskIdSet = new Set(taskIds);
    const planItemsToRemove = planItems.filter((item) => taskIdSet.has(item.taskId));

    setIsRollingOver(true);
    setRollingOutTaskIds(taskIdSet);
    toast(`Rolling over ${rolloverCandidates.length} tasks to tomorrow...`);

    try {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 260));

      rollOverTasks(taskIds, tomorrow);
      for (const item of planItemsToRemove) {
        removePlanItem(item.id, today);
      }

      const results = await Promise.all(
        taskIds.map(async (taskId) => {
          const res = await fetch(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dueDate: tomorrow }),
          });
          return { taskId, ok: res.ok };
        })
      );

      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        toast.error(`Rolled over with ${failed.length} sync failure${failed.length === 1 ? '' : 's'}.`);
      } else {
        toast.success(`Rolled over ${taskIds.length} task${taskIds.length === 1 ? '' : 's'} to tomorrow.`);
      }
    } catch {
      toast.error('Failed to roll over tasks.');
    } finally {
      setRollingOutTaskIds(new Set());
      setIsRollingOver(false);
    }
  }, [isRollingOver, rolloverCandidates, planItems, rollOverTasks, removePlanItem, today]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    })
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === 'pool-task') {
      setActiveDragTaskId(data.taskId as string);
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragTaskId(null);

    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // ── Pool task → timeline ──────────────────────────────────────────────
    if (activeData?.type === 'pool-task' && (over.id === 'timeline-drop' || overData?.type === 'timeline')) {
      const taskId = activeData.taskId as string;
      const task = taskMap.get(taskId);
      const duration = DEFAULT_TASK_DURATION_MINS;

      let startTime: string;

      const scrollContainer = timelineScrollRef.current;
      const timelineGridBody = timelineGridBodyRef.current;
      if (scrollContainer) {
        // Prefer dnd-kit's translated drag rect on drop; it's more reliable than
        // activatorEvent+delta when overlays/indicators are present.
        const translated = active.rect.current.translated;
        const finalClientY = translated
          ? translated.top + translated.height / 2
          : ((event.activatorEvent as PointerEvent).clientY + event.delta.y);

        const measurementTarget = timelineGridBody ?? scrollContainer;
        const rect = measurementTarget.getBoundingClientRect();
        const absoluteY = finalClientY - rect.top + scrollContainer.scrollTop;

        // pixel → minute (timeline starts at 00:00, so no startHour offset needed)
        const rawMins = absoluteY / PX_PER_MIN;
        const snappedMins = Math.round(rawMins / DROP_SNAP_MINS) * DROP_SNAP_MINS;
        const proposedStart = Math.max(0, Math.min(snappedMins, 24 * 60 - duration));
        const proposedEnd = proposedStart + duration;

        // Collision check against all busy ranges for today
        const collision = busyRanges.some((r) => {
          const rStart = timeToMinutes(r.startTime);
          const rEnd   = timeToMinutes(r.endTime);
          return proposedStart < rEnd && proposedEnd > rStart;
        });

        if (!collision) {
          // Drop position is free — honour it exactly
          startTime = minutesToTime(proposedStart);
        } else {
          // Collision: find the next free gap AFTER the drop point (not the
          // earliest free slot of the whole day)
          const adjusted = findNextFreeSlot(
            busyRanges,
            duration,
            minutesToTime(proposedStart),
            '23:59',
          );
          if (!adjusted) {
            notify('No free time available near that slot.');
            return;
          }
          startTime = adjusted;
        }
      } else {
        // Fallback if the ref isn't mounted yet (should not normally happen)
        startTime = findNextFreeSlot(busyRanges, duration) ?? '00:00';
      }

      const endTime = addMinsToTime(startTime, duration);
      const added = addPlanItem(taskId, today, startTime, endTime);

      // Promote 'todo' → 'doing' when a task is first planned
      if (added && task && task.status === 'todo') {
        updateTask(taskId, { status: 'doing' });
      }
      return;
    }

    // ── Reorder planned items ─────────────────────────────────────────────
    if (activeData?.type === 'planned-item' && overData?.type === 'planned-item') {
      const activeId = activeData.planItemId as string;
      const overId = overData.planItemId as string;
      if (activeId === overId) return;

      const ids = planItems.map((i) => i.id);
      const oldIndex = ids.indexOf(activeId);
      const newIndex = ids.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(ids, oldIndex, newIndex) as string[];
      reorderPlanItems(today, reordered);
    }
  }, [today, busyRanges, planItems, taskMap, addPlanItem, reorderPlanItems, updateTask]);

  const handleRemovePlanItem = useCallback((planItemId: string) => {
    removePlanItem(planItemId, today);
  }, [removePlanItem, today]);

  const handleMarkTaskDone = useCallback((taskId: string) => {
    const task = taskMap.get(taskId);
    if (!task) return;
    updateTask(taskId, { status: task.status === 'done' ? 'doing' : 'done' });
  }, [updateTask, taskMap]);

  const handleUpdatePlanItemTime = useCallback((planItemId: string, startTime: string, endTime: string) => {
    updatePlanItem(planItemId, today, { startTime, endTime });
  }, [updatePlanItem, today]);

  // ── Quick-add task (pool) ─────────────────────────────────────────────────
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddDuration, setQuickAddDuration] = useState(30);
  const [quickAddDifficulty, setQuickAddDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [quickAddEmojiOpen, setQuickAddEmojiOpen] = useState(false);
  const quickAddInputRef = useRef<HTMLInputElement>(null);

  const openQuickAdd = useCallback(() => {
    setQuickAddOpen(true);
    setQuickAddTitle('');
    setQuickAddDuration(30);
    setQuickAddEmojiOpen(false);
    setTimeout(() => quickAddInputRef.current?.focus(), 30);
  }, []);

  const handleQuickAddEmoji = useCallback((emoji: string) => {
    setQuickAddTitle((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${emoji} ${trimmed}` : emoji;
    });
    setQuickAddEmojiOpen(false);
    setTimeout(() => quickAddInputRef.current?.focus(), 0);
  }, []);

  const commitQuickAdd = useCallback(() => {
    const trimmed = quickAddTitle.trim();
    if (!trimmed) { setQuickAddOpen(false); return; }
    addTask({ title: trimmed, status: 'todo', priority: 'medium', difficulty: quickAddDifficulty, durationMinutes: quickAddDuration });
    setQuickAddTitle('');
    // Keep open so user can add multiple tasks in a row
    setTimeout(() => quickAddInputRef.current?.focus(), 20);
  }, [quickAddTitle, quickAddDuration, quickAddDifficulty, addTask]);

  const cancelQuickAdd = useCallback(() => {
    setQuickAddOpen(false);
    setQuickAddTitle('');
    setQuickAddDuration(30);
    setQuickAddDifficulty('medium');
    setQuickAddEmojiOpen(false);
  }, []);

  // ── Task Pool collapse (small screens only) ───────────────────────────────
  const [poolOpen, setPoolOpen] = useState(true);

  const poolViewportRef = useRef<HTMLDivElement | null>(null);
  // Ref to DayCalendarTimeline's scroll container — used for pixel→minute on drop
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  // Ref to the timeline's absolute-positioned grid body for stable drop math.
  const timelineGridBodyRef = useRef<HTMLDivElement | null>(null);
  const poolWindow = useVirtualWindow({
    count: poolTasks.length,
    itemSize: POOL_ROW_ESTIMATE_PX,
    overscan: 10,
    containerRef: poolViewportRef,
  });
  const visiblePoolTasks = useMemo(
    () => poolTasks.slice(poolWindow.startIndex, poolWindow.endIndex),
    [poolTasks, poolWindow.startIndex, poolWindow.endIndex],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Skeleton
      name="planner.DailyPlanView"
      loading={!mounted || !dbHydrated}
      className="flex-1 flex flex-col min-h-0"
      fallback={
          <div className="flex flex-col h-full gap-5">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-2">
                <SkeletonPrimitive className="h-6 w-40 rounded-lg" />
                <SkeletonPrimitive className="h-4 w-24 rounded" />
              </div>
              <div className="flex gap-2">
                <SkeletonPrimitive className="h-9 w-28 rounded-xl" />
                <SkeletonPrimitive className="h-9 w-28 rounded-xl" />
              </div>
            </div>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-[220px_1fr_200px] gap-3 md:gap-4 min-h-0">
              <div className="hidden md:flex flex-col gap-2">
                <SkeletonPrimitive className="h-4 w-20 rounded" />
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border/30">
                    <SkeletonPrimitive className="w-3 h-10 rounded" />
                    <div className="flex-1 flex flex-col gap-1.5">
                      <SkeletonPrimitive className="h-3.5 w-full rounded" />
                      <SkeletonPrimitive className="h-2.5 w-2/3 rounded" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col border border-border/50 rounded-2xl overflow-hidden bg-background">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
                  <SkeletonPrimitive className="h-4 w-32 rounded" />
                </div>
                <div className="flex-1 px-3 py-2 flex flex-col gap-2">
                  {[1, 2, 3, 5, 6].map(i => (
                    <div key={i} className="flex gap-3 items-start">
                      <SkeletonPrimitive className="w-10 h-3 rounded mt-1 flex-shrink-0" />
                      <SkeletonPrimitive className="flex-1 h-12 rounded-xl" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="hidden md:flex flex-col gap-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="rounded-xl border border-border/40 p-3 flex flex-col gap-2">
                    <SkeletonPrimitive className="h-3 w-16 rounded" />
                    <SkeletonPrimitive className="h-6 w-12 rounded-md" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        }
      >
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full gap-5">
        {/* Header */}
        <DailyPlanHeader
          date={todayDate}
          plannedCount={visiblePlanItems.length}
          unplannedCount={poolTasks.length}
          rolloverCount={rolloverCandidates.length}
          onRollOver={handleRollOverTasks}
          onAutoPlan={handleAutoPlanDay}
          onToggleInsights={onToggleInsights}
          insightsOpen={insightsOpen}
          isPlanning={isPlanningDay}
          isRollingOver={isRollingOver}
        />

        {/* Mobile summary cards */}
        <div className="md:hidden -mx-1 px-1 overflow-x-auto no-scrollbar snap-x snap-mandatory flex gap-2 pb-1">
          <div className="w-[82vw] shrink-0 snap-start rounded-2xl border border-border/60 bg-muted/30 backdrop-blur-md p-3">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">Planned</p>
            <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{summary.plannedCount}</p>
            <p className="text-[11px] text-muted-foreground/70">{summary.plannedMinutes} mins scheduled</p>
          </div>
          <div className="w-[82vw] shrink-0 snap-start rounded-2xl border border-border/60 bg-muted/30 backdrop-blur-md p-3">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">Remaining</p>
            <p className="mt-1 text-xl font-semibold text-amber-400 tabular-nums">{summary.unplannedCount}</p>
            <p className="text-[11px] text-muted-foreground/70">Tasks still unplanned</p>
          </div>
          <div className="w-[82vw] shrink-0 snap-start rounded-2xl border border-border/60 bg-muted/30 backdrop-blur-md p-3">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">Best Window</p>
            <p className="mt-1 text-sm font-semibold text-emerald-400 tabular-nums">
              {summary.topFreeBlock ? `${summary.topFreeBlock.startTime}-${summary.topFreeBlock.endTime}` : 'No free block'}
            </p>
            <p className="text-[11px] text-muted-foreground/70">Swipe for details</p>
          </div>
        </div>

        {/* Three-column body */}
        <div className={`flex-1 grid gap-3 md:gap-4 min-h-0 transition-[grid-template-columns] duration-200 ${
          poolOpen
            ? 'grid-cols-1 md:grid-cols-[260px_1fr_200px] xl:grid-cols-[290px_1fr_220px]'
            : 'grid-cols-1 md:grid-cols-[0px_1fr_200px] xl:grid-cols-[0px_1fr_220px]'
        }`}>
          {/* ── Left: Task Pool ───────────────────────────────────────────── */}
          <div data-tutorial="plan-pool" className={`hidden md:flex flex-col min-h-0 overflow-hidden transition-all duration-200 ${poolOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {/* Pool header with + button */}
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 flex items-center gap-1.5">
                Task Pool
                {poolTasks.length > 0 && (
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted text-[9px] font-bold text-muted-foreground tabular-nums">
                    {poolTasks.length}
                  </span>
                )}
              </h2>
              <button
                type="button"
                onClick={openQuickAdd}
                title="Add task"
                aria-label="Add task to pool"
                className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>

            {/* Inline quick-add form */}
            {quickAddOpen && (
              <div className="flex-shrink-0 mb-2">
                <div className="flex flex-col gap-1.5 p-2 rounded-xl border border-primary/30 bg-primary/5 shadow-card">
                  {/* Row 1: emoji + title input */}
                  <div className="flex items-center gap-1.5">
                    <Popover open={quickAddEmojiOpen} onOpenChange={setQuickAddEmojiOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label="Insert emoji"
                          className="flex-shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-[13px]"
                        >
                          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" sideOffset={6} className="w-auto p-0 border-0 bg-transparent shadow-none">
                        <CompactEmojiPicker onSelect={handleQuickAddEmoji} />
                      </PopoverContent>
                    </Popover>

                    <input
                      ref={quickAddInputRef}
                      value={quickAddTitle}
                      onChange={(e) => setQuickAddTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitQuickAdd(); }
                        if (e.key === 'Escape') cancelQuickAdd();
                      }}
                      placeholder="Task title…"
                      className="flex-1 min-w-0 bg-transparent text-[12px] font-medium text-foreground placeholder:text-muted-foreground/40 outline-none"
                    />
                  </div>
                  {/* Row 2: duration + difficulty + actions */}
                  <div className="flex items-center gap-1.5">
                    <Select value={String(quickAddDuration)} onValueChange={(value) => setQuickAddDuration(Number(value))}>
                      <SelectTrigger
                        aria-label="Task duration"
                        className="flex-none h-6 w-[56px] rounded-md border-border/40 bg-muted/30 px-1.5 text-[10px] text-muted-foreground"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="w-[72px] border-border bg-popover/95 text-foreground backdrop-blur-md">
                        <SelectItem className="text-[11px]" value="15">15m</SelectItem>
                        <SelectItem className="text-[11px]" value="30">30m</SelectItem>
                        <SelectItem className="text-[11px]" value="45">45m</SelectItem>
                        <SelectItem className="text-[11px]" value="60">60m</SelectItem>
                        <SelectItem className="text-[11px]" value="90">90m</SelectItem>
                        <SelectItem className="text-[11px]" value="120">120m</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex-shrink-0 flex items-center rounded-md border border-border/40 bg-muted/30 overflow-hidden">
                      {(['easy', 'medium', 'hard'] as const).map((d) => {
                        const active = quickAddDifficulty === d;
                        const colors = d === 'easy'
                          ? active ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/60 hover:text-emerald-600'
                          : d === 'medium'
                          ? active ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'text-muted-foreground/60 hover:text-amber-600'
                          : active ? 'bg-destructive/20 text-destructive' : 'text-muted-foreground/60 hover:text-destructive';
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setQuickAddDifficulty(d)}
                            className={`w-5 h-6 text-[10px] font-bold transition-colors ${colors}`}
                            title={d.charAt(0).toUpperCase() + d.slice(1)}
                          >
                            {d[0].toUpperCase()}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={commitQuickAdd}
                      disabled={!quickAddTitle.trim()}
                      className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-md bg-primary text-primary-foreground disabled:opacity-30 hover:bg-primary/90 transition-colors"
                    >
                      <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={cancelQuickAdd}
                      className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/60 transition-colors"
                    >
                      <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/40 mt-1 px-1">Enter to add · Esc to cancel</p>
              </div>
            )}

            <div ref={poolViewportRef} className="flex-1 overflow-y-auto no-scrollbar pr-1" data-virtualized="true">
              {poolTasks.length === 0 && !quickAddOpen ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="text-3xl mb-2">✓</div>
                  <p className="text-[12px] font-medium text-muted-foreground/70">All tasks planned</p>
                  <p className="text-[11px] text-muted-foreground/40 mt-1">Nice work!</p>
                </div>
              ) : (
                <div
                  style={{
                    paddingTop: poolWindow.paddingTop,
                    paddingBottom: poolWindow.paddingBottom,
                  }}
                >
                  <div className="space-y-1.5">
                    {visiblePoolTasks.map((task) => (
                      <TaskPoolCard key={task.id} task={task} onDelete={deleteTask} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Center: Timeline ──────────────────────────────────────────── */}
          <div className="flex flex-col min-h-0 border border-border/50 rounded-2xl overflow-hidden bg-background">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 flex-shrink-0">
              <div className="flex items-center gap-2">
                {/* Toggle Task Pool — always shown */}
                <button
                  type="button"
                  onClick={() => setPoolOpen((v) => !v)}
                  title={poolOpen ? 'Hide task pool' : 'Show task pool'}
                  aria-label={poolOpen ? 'Hide task pool' : 'Show task pool'}
                  className="flex items-center justify-center w-8 h-8 md:w-6 md:h-6 rounded-lg md:rounded-md text-muted-foreground/50 hover:text-primary hover:bg-primary/10 active:bg-primary/10 transition-colors"
                >
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    {poolOpen
                      ? <><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></>
                      : <><rect x="3" y="3" width="7" height="18" rx="1" opacity="0.4"/><rect x="14" y="3" width="7" height="18" rx="1"/></>}
                  </svg>
                </button>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
                  Today's Timeline
                </h2>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-2 rounded-sm border-l-2 border-muted-foreground/30 bg-muted/40" />
                  Calendar event
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-2 rounded-sm border border-primary/30 bg-primary/10" />
                  Planned task
                </span>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-2 md:px-3 py-2">
              <TodayTimeline
                todayEvents={todayEvents}
                planItems={visiblePlanItems}
                taskMap={taskMap}
                revealPlanItemDelays={revealPlanItemDelays}
                onRemovePlanItem={handleRemovePlanItem}
                onMarkTaskDone={handleMarkTaskDone}
                onUpdatePlanItemTime={handleUpdatePlanItemTime}
                scrollContainerRef={timelineScrollRef as React.RefObject<HTMLDivElement>}
                gridBodyRef={timelineGridBodyRef as React.RefObject<HTMLDivElement>}
              />
            </div>
            {visiblePlanItems.length === 0 && poolTasks.length > 0 && (
              <div className="px-4 pb-4 flex-shrink-0">
                <p className="text-center text-[11px] text-muted-foreground/40 py-2">
                  Drag tasks from the left into the timeline
                </p>
              </div>
            )}
          </div>

          {/* ── Right: Summary ────────────────────────────────────────────── */}
          <div className="hidden md:flex flex-col min-h-0 overflow-y-auto no-scrollbar">
            <FreeTimePanel summary={summary} />
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
        {activeDragTask && <TaskPoolCardOverlay task={activeDragTask} />}
      </DragOverlay>

      <PlanningModal open={isPlanningDay} phase={planningPhase} onClose={() => setIsPlanningDay(false)} />
    </DndContext>
    </Skeleton>
  );
};
