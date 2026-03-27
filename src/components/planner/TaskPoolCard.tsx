'use client';

import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Task, TaskPriority } from '../../types/task';
import { getDueDatePresentation } from '../../utils/taskBoard';

interface TaskPoolCardProps {
  task: Task;
  onDelete: (id: string) => void;
}

const GripIcon: React.FC = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/40">
    <circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" />
    <circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />
  </svg>
);

// ── Priority chip ─────────────────────────────────────────────────────────────

const PRIORITY_META: Record<TaskPriority, { label: string; className: string }> = {
  high:   { label: 'High',   className: 'border-red-400/30 bg-red-500/12 text-red-300' },
  medium: { label: 'Mid',    className: 'border-amber-300/25 bg-amber-400/12 text-amber-300' },
  low:    { label: 'Low',    className: 'border-cyan-300/25 bg-cyan-400/12 text-cyan-300' },
};

const Chip: React.FC<{ children: React.ReactNode; className: string }> = ({ children, className }) => (
  <span className={`inline-flex items-center rounded border px-1.5 py-px text-[10px] font-medium leading-none ${className}`}>
    {children}
  </span>
);

// ── Card ─────────────────────────────────────────────────────────────────────

export const TaskPoolCard: React.FC<TaskPoolCardProps> = React.memo(({ task, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `pool-${task.id}`,
    data: { type: 'pool-task', taskId: task.id },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
    touchAction: 'none',
  };

  const priority = PRIORITY_META[task.priority];
  const dueDate = getDueDatePresentation(task.dueDate, task.status);
  const isScheduled = Boolean(task.scheduledStart && task.scheduledEnd);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-start gap-2.5 px-3 py-2.5 rounded-xl border bg-background select-none transition-all duration-[120ms] ease-out
        border-border/60 hover:border-primary/30 hover:bg-accent/30 focus-within:ring-2 focus-within:ring-primary/40
        ${isDragging ? 'shadow-elevated scale-[1.02]' : 'shadow-soft hover:-translate-y-[1px] hover:shadow-md'}`}
    >
      {/* Drag handle */}
      <div className="mt-[3px] flex-shrink-0 cursor-grab" {...attributes} {...listeners}>
        <GripIcon />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground leading-snug truncate">{task.title}</p>

        {task.description && (
          <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-relaxed line-clamp-1">{task.description}</p>
        )}

        {/* Chips row */}
        <div className="flex flex-wrap items-center gap-1 mt-1.5">
          {/* Priority */}
          <Chip className={priority.className}>{priority.label}</Chip>

          {/* Scheduled */}
          {isScheduled && (
            <Chip className="border-primary/20 bg-primary/10 text-primary/80">
              {task.scheduledStart}–{task.scheduledEnd}
            </Chip>
          )}

          {/* Due date */}
          {dueDate && (
            <Chip className={dueDate.className}>{dueDate.label}</Chip>
          )}

          {/* Context */}
          {task.context && (
            <Chip className="border-border/40 bg-muted/30 text-muted-foreground">{task.context}</Chip>
          )}
        </div>
      </div>

      {/* Delete button */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
        title="Remove task"
        aria-label="Remove task"
        className="flex-shrink-0 flex items-center justify-center w-8 h-8 md:w-5 md:h-5 rounded-lg md:rounded-md opacity-100 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground/40 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 active:bg-rose-500/10 transition-all duration-100"
      >
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
});

TaskPoolCard.displayName = 'TaskPoolCard';

// ── Drag ghost overlay ────────────────────────────────────────────────────────

export const TaskPoolCardOverlay: React.FC<{ task: Task }> = React.memo(({ task }) => {
  const priority = PRIORITY_META[task.priority];
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-primary/40 bg-background shadow-elevated cursor-grabbing select-none opacity-95 max-w-[220px]">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground leading-snug truncate">{task.title}</p>
        <div className="mt-1">
          <Chip className={priority.className}>{priority.label}</Chip>
        </div>
      </div>
    </div>
  );
});

TaskPoolCardOverlay.displayName = 'TaskPoolCardOverlay';
