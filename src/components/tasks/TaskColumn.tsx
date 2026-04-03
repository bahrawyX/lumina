'use client';

import React, { useMemo, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { motion } from 'framer-motion';
import type { CalendarEvent } from '../../types';
import type { Task, TaskPriority, TaskStatus } from '../../types/task';
import { getDoingFocusHint } from '../../utils/taskBoard';
import { TaskCard } from './TaskCard';
import { useVirtualWindow } from '../../hooks/useVirtualWindow';
import { LottieAnimation, EMPTY_STATE_TASKS_LAYER_MAP } from '../ui/LottieAnimation';

// ── Column status accent colors ───────────────────────────────────────────────

const STATUS_ACCENT: Record<TaskStatus, string> = {
  todo:  'bg-sky-500',
  doing: 'bg-amber-500',
  done:  'bg-emerald-500',
};

const TASK_ROW_ESTIMATE_PX = 96;

// ── Column component ─────────────────────────────────────────────────────────

interface TaskColumnProps {
  id: TaskStatus;
  label: string;
  tasks: Task[];
  linkedEvents: Record<string, CalendarEvent | undefined>;
  isDragOver: boolean;
  onPriorityChange: (task: Task, priority: TaskPriority) => void;
  onAddTask: (status: TaskStatus) => void;
  onEditTask: (task: Task) => void;
  onScheduleTask: (task: Task) => void;
  onAutoScheduleTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onFocusTask: (task: Task) => void;
}

export const TaskColumn = React.memo<TaskColumnProps>(({
  id, label, tasks, linkedEvents, isDragOver,
  onPriorityChange,
  onAddTask, onEditTask, onScheduleTask, onAutoScheduleTask, onDeleteTask, onFocusTask,
}) => {
  const { setNodeRef } = useDroppable({ id });
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Stable id array for SortableContext — recomputed only when tasks change
  const taskIds = useMemo(() => tasks.map(t => t.id), [tasks]);
  const doingHint = useMemo(() => (id === 'doing' ? getDoingFocusHint(tasks.length) : null), [id, tasks.length]);

  const windowed = useVirtualWindow({
    count: tasks.length,
    itemSize: TASK_ROW_ESTIMATE_PX,
    overscan: 8,
    containerRef: viewportRef,
  });

  const visibleTasks = useMemo(
    () => tasks.slice(windowed.startIndex, windowed.endIndex),
    [tasks, windowed.startIndex, windowed.endIndex],
  );

  return (
    <div className="flex flex-col w-full md:flex-1 md:min-w-[260px] md:max-w-[340px] h-full">
      {/* Column header — click to add a task */}
      <button
        type="button"
        onClick={() => onAddTask(id)}
        className="mb-3 px-1 w-full text-left group/col-header rounded-xl transition-colors py-1 -mt-1"
        aria-label={`Add task to ${label}`}
      >
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_ACCENT[id]}`} />
          <h3 className="font-display text-sm font-semibold text-foreground tracking-[-0.01em]">
            {label}
          </h3>
          <span className="ml-auto text-[10px] font-semibold tabular-nums text-muted-foreground bg-muted rounded-full px-2 py-0.5 border border-border/50">
            {tasks.length}
          </span>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/0 group-hover/col-header:text-muted-foreground/50 transition-colors flex-shrink-0">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
        {doingHint && (
          <p className="pl-[18px] pt-1 text-[11px] font-medium text-muted-foreground/75">
            {doingHint}
          </p>
        )}
      </button>

      {/* Drop zone + card list — clicking the background opens the add-task dialog */}
      <div
        ref={setNodeRef}
        onClick={(e) => {
          if (isDragOver) return;
          // Fire only when clicking the column background, not on a task card
          if (!(e.target as Element).closest('[data-task-card-wrapper]')) {
            onAddTask(id);
          }
        }}
        className={`flex-1 flex flex-col rounded-xl border p-1.5 min-h-[120px] transition-colors duration-300 cursor-pointer ${
          isDragOver
            ? 'border-primary/30 bg-primary/10'
            : 'border-border/50 bg-muted/40 hover:bg-muted/50'
        }`}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div
            ref={viewportRef}
            className={`overflow-y-auto no-scrollbar ${tasks.length > 0 ? 'h-full' : ''}`}
            data-virtualized="true"
          >
            <div
              style={{
                paddingTop: windowed.paddingTop,
                paddingBottom: windowed.paddingBottom,
              }}
            >
              <div className="flex flex-col gap-2">
                {visibleTasks.map(task => (
                <motion.div key={task.id} layout data-task-card-wrapper>
                  <TaskCard
                    task={task}
                    linkedEvent={task.linkedEventId ? linkedEvents[task.linkedEventId] ?? null : null}
                    onPriorityChange={onPriorityChange}
                    onEdit={onEditTask}
                    onSchedule={onScheduleTask}
                    onAutoSchedule={onAutoScheduleTask}
                    onDelete={onDeleteTask}
                    onFocus={onFocusTask}
                  />
                </motion.div>
              ))}
              </div>
            </div>
          </div>
        </SortableContext>

        {/* Empty state hint */}
        {tasks.length === 0 && (
          <div
            className="w-full flex-1 flex flex-col items-center justify-center gap-2 rounded-xl group/empty pointer-events-none"
          >
            {isDragOver ? (
              <p className="text-[11px] text-muted-foreground/50 select-none">Drop here</p>
            ) : (
              <>
                <LottieAnimation
                  path="/animations/empty-state-tasks.json"
                  layerColorMap={EMPTY_STATE_TASKS_LAYER_MAP}
                  width={80}
                  height={80}
                  loop={true}
                  autoplay={true}
                />
                <p className="text-[11px] text-muted-foreground/40 select-none transition-colors">
                  {id === 'todo' ? 'No tasks yet' :
                   id === 'doing' ? 'Nothing in progress' :
                   id === 'done' ? 'Nothing completed yet' :
                   'No tasks'}
                </p>
              </>
            )}
          </div>
        )}
      </div>

    </div>
  );
});
TaskColumn.displayName = 'TaskColumn';
