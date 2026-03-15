'use client';

import React, { useMemo, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { CalendarEvent } from '../../types';
import type { Task, TaskStatus } from '../../types/task';
import { getDoingFocusHint } from '../../utils/taskBoard';
import { TaskCard } from './TaskCard';
import { Button } from '../ui/button';
import { useVirtualWindow } from '../../hooks/useVirtualWindow';

// ── Plus icon ─────────────────────────────────────────────────────────────────

const PlusIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

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
  onAddTask: (status: TaskStatus) => void;
  onEditTask: (task: Task) => void;
  onScheduleTask: (task: Task) => void;
  onAutoScheduleTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onFocusTask: (task: Task) => void;
}

export const TaskColumn = React.memo<TaskColumnProps>(({
  id, label, tasks, linkedEvents, isDragOver,
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
    <div className="flex flex-col flex-1 min-w-[260px] max-w-[340px] h-full">
      {/* Column header */}
      <div className="mb-3 px-1">
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_ACCENT[id]}`} />
          <h3 className="font-display text-sm font-semibold text-foreground tracking-[-0.01em]">
            {label}
          </h3>
          <span className="ml-auto text-[10px] font-semibold tabular-nums text-muted-foreground bg-muted rounded-full px-2 py-0.5 border border-border/50">
            {tasks.length}
          </span>
        </div>
        {doingHint && (
          <p className="pl-[18px] pt-1 text-[11px] font-medium text-muted-foreground/75">
            {doingHint}
          </p>
        )}
      </div>

      {/* Drop zone + card list */}
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-2xl border-2 border-dashed p-1.5 min-h-[120px] transition-colors ${
          isDragOver
            ? 'border-border bg-primary/5'
            : 'border-transparent bg-transparent'
        }`}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <div
            ref={viewportRef}
            className="h-full overflow-y-auto no-scrollbar"
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
                <TaskCard
                  key={task.id}
                  task={task}
                  linkedEvent={task.linkedEventId ? linkedEvents[task.linkedEventId] ?? null : null}
                  onEdit={onEditTask}
                  onSchedule={onScheduleTask}
                  onAutoSchedule={onAutoScheduleTask}
                  onDelete={onDeleteTask}
                  onFocus={onFocusTask}
                />
              ))}
              </div>
            </div>
          </div>
        </SortableContext>

        {/* Empty state */}
        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-[80px] gap-1.5">
            <p className="text-[11px] text-muted-foreground/50 select-none">
              {isDragOver ? 'Drop here' : 'No tasks yet'}
            </p>
          </div>
        )}
      </div>

      {/* Add task button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onAddTask(id)}
        className="mt-2 w-full justify-start gap-1.5 text-muted-foreground hover:text-foreground h-8 rounded-xl text-xs font-medium"
        aria-label={`Add task to ${label}`}
      >
        <PlusIcon />
        Add task
      </Button>
    </div>
  );
});
TaskColumn.displayName = 'TaskColumn';
