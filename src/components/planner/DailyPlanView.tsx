'use client';

import React, { useCallback, useMemo, useState, useRef } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { format } from 'date-fns';

import { useCalendarStore } from '../../store/useCalendarStore';
import { useCalendarEventsStore } from '../../store/useCalendarEventsStore';
import { useTaskBoardStore } from '../../store/useTaskBoardStore';
import { useDailyPlanStore, todayKey } from '../../store/useDailyPlanStore';
import type { Task } from '../../types/task';

import {
  computePlanSummary,
  findNextFreeSlot,
  DEFAULT_TASK_DURATION_MINS,
  addMinsToTime,
  minutesToTime,
  timeToMinutes,
} from '../../utils/dailyPlanUtils';
import { HOUR_HEIGHT } from '../../utils/dateUtils';
import { autoPlanDay } from '../../utils/scheduling/autoPlanDay';
import notify from '../../utils/notify';
import { useVirtualWindow } from '../../hooks/useVirtualWindow';

import { DailyPlanHeader } from './DailyPlanHeader';
import { TodayTimeline } from './TodayTimeline';
import { TaskPoolCard, TaskPoolCardOverlay } from './TaskPoolCard';
import { FreeTimePanel } from './FreeTimePanel';

const POOL_ROW_ESTIMATE_PX = 78;

// Pixel-to-minute conversion — must match DayCalendarTimeline (HOUR_HEIGHT / 60)
const PX_PER_MIN = HOUR_HEIGHT / 60;
// Snap resolution for drops: 5-minute grid
const DROP_SNAP_MINS = 5;

// ── Main view ─────────────────────────────────────────────────────────────────

export const DailyPlanView: React.FC = () => {
  const today = todayKey();
  const todayDate = useMemo(() => new Date(), []);

  // ── Calendar store (scoped selectors) ────────────────────────────────────
  const allEvents = useCalendarEventsStore((s) => s.events);

  // ── Task board store ──────────────────────────────────────────────────────
  const allTasks = useTaskBoardStore((s) => s.tasks);
  const updateTask = useTaskBoardStore((s) => s.updateTask);
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

  // Task pool: non-done tasks not already planned
  const poolTasks = useMemo(
    () => allTasks.filter((t) => t.status !== 'done' && !plannedTaskIds.has(t.id)),
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

  // ── Drag state (local) ────────────────────────────────────────────────────
  const [activeDragTaskId, setActiveDragTaskId] = useState<string | null>(null);
  const activeDragTask = activeDragTaskId ? taskMap.get(activeDragTaskId) ?? null : null;

  // ── Auto Plan My Day ──────────────────────────────────────────────────────
  const [isPlanningDay, setIsPlanningDay] = useState(false);

  const handleAutoPlanDay = useCallback(() => {
    if (isPlanningDay || poolTasks.length === 0) return;

    setIsPlanningDay(true);
    try {
      const now = new Date();
      const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const assignments = autoPlanDay(poolTasks, busyRanges, nowTime);
      if (assignments.length === 0) {
        notify('No unscheduled tasks fit the remaining time today.');
        return;
      }

      const added = batchAddPlanItems(today, assignments);
      const addedTaskIds = new Set(added.map((i) => i.taskId));
      for (const task of poolTasks) {
        if (addedTaskIds.has(task.id) && task.status === 'todo') {
          updateTask(task.id, { status: 'doing' });
        }
      }

      notify(`Scheduled ${added.length} task${added.length === 1 ? '' : 's'} for today \u2728`);
    } finally {
      setIsPlanningDay(false);
    }
  }, [isPlanningDay, poolTasks, busyRanges, today, batchAddPlanItems, updateTask]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
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
      if (scrollContainer) {
        // Compute the exact pointer position at the moment of drop.
        // dnd-kit's activatorEvent is the initial pointerdown; delta is the
        // total displacement from that point to the drop position.
        const activatorEvent = event.activatorEvent as PointerEvent;
        const finalClientY = activatorEvent.clientY + event.delta.y;

        // Convert to absolute scroll-container Y (accounts for scroll offset)
        const rect = scrollContainer.getBoundingClientRect();
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

  const handleUpdatePlanItemTime = useCallback((planItemId: string, startTime: string, endTime: string) => {
    updatePlanItem(planItemId, today, { startTime, endTime });
  }, [updatePlanItem, today]);

  // ── Quick-add task (pool) ─────────────────────────────────────────────────
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const quickAddInputRef = useRef<HTMLInputElement>(null);

  const openQuickAdd = useCallback(() => {
    setQuickAddOpen(true);
    setQuickAddTitle('');
    setTimeout(() => quickAddInputRef.current?.focus(), 30);
  }, []);

  const commitQuickAdd = useCallback(() => {
    const trimmed = quickAddTitle.trim();
    if (!trimmed) { setQuickAddOpen(false); return; }
    addTask({ title: trimmed, status: 'todo', priority: 'medium' });
    setQuickAddTitle('');
    // Keep open so user can add multiple tasks in a row
    setTimeout(() => quickAddInputRef.current?.focus(), 20);
  }, [quickAddTitle, addTask]);

  const cancelQuickAdd = useCallback(() => {
    setQuickAddOpen(false);
    setQuickAddTitle('');
  }, []);

  // ── Task Pool collapse (small screens only) ───────────────────────────────
  const [poolOpen, setPoolOpen] = useState(true);

  const poolViewportRef = useRef<HTMLDivElement | null>(null);
  // Ref to DayCalendarTimeline's scroll container — used for pixel→minute on drop
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
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
          plannedCount={planItems.length}
          unplannedCount={poolTasks.length}
          onAutoPlan={handleAutoPlanDay}
          isPlanning={isPlanningDay}
        />

        {/* Three-column body */}
        <div className={`flex-1 grid gap-4 min-h-0 transition-[grid-template-columns] duration-200 ${
          poolOpen
            ? 'grid-cols-[220px_1fr_200px] xl:grid-cols-[240px_1fr_220px]'
            : 'grid-cols-[0px_1fr_200px] xl:grid-cols-[0px_1fr_220px]'
        }`}>
          {/* ── Left: Task Pool ───────────────────────────────────────────── */}
          <div className={`flex flex-col min-h-0 overflow-hidden transition-all duration-200 ${poolOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
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
                className="flex items-center justify-center w-5 h-5 rounded-md text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>

            {/* Inline quick-add form */}
            {quickAddOpen && (
              <div className="flex-shrink-0 mb-2">
                <div className="flex items-center gap-1.5 p-2 rounded-xl border border-gray-300 dark:border-primary/30 bg-white dark:bg-primary/10 shadow-sm">
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
                  className="flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
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
            <div className="flex-1 min-h-0 flex flex-col px-2 py-2">
              <TodayTimeline
                todayEvents={todayEvents}
                planItems={planItems}
                taskMap={taskMap}
                onRemovePlanItem={handleRemovePlanItem}
                onUpdatePlanItemTime={handleUpdatePlanItemTime}
                scrollContainerRef={timelineScrollRef as React.RefObject<HTMLDivElement>}
              />
            </div>
            {planItems.length === 0 && poolTasks.length > 0 && (
              <div className="px-4 pb-4 flex-shrink-0">
                <p className="text-center text-[11px] text-muted-foreground/40 py-2">
                  Drag tasks from the left into the timeline
                </p>
              </div>
            )}
          </div>

          {/* ── Right: Summary ────────────────────────────────────────────── */}
          <div className="flex flex-col min-h-0 overflow-y-auto no-scrollbar">
            <FreeTimePanel summary={summary} />
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
        {activeDragTask && <TaskPoolCardOverlay task={activeDragTask} />}
      </DragOverlay>
    </DndContext>
  );
};
