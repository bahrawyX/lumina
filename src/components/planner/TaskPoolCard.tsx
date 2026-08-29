'use client';

import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../../types/task';
import { getDueDatePresentation } from '../../utils/taskBoard';
import { PRIORITY_META, PRIORITY_SHAPE } from '../../utils/taskBadges';

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

/**
 * The shared `PRIORITY_META` from `taskBadges`, not a local copy.
 *
 * There was a third palette here — red/amber/**cyan**, with `text-red-300`
 * and friends. Two problems. It disagreed with the kanban and list views on
 * what "low priority" looks like (cyan, against their neutral grey) and on the
 * label ("Mid" against "Medium"). And the whole set was picked for a dark
 * background: `text-amber-300` on the light theme's near-white card is close
 * to unreadable, with no `dark:` variant to switch it.
 */

/**
 * `shape` defaults to the priority pill because that is the only chip this card
 * renders today. It is a parameter rather than a hardcoded class so a
 * difficulty chip added here later cannot silently inherit the pill and undo
 * the distinction — see the note in `taskBadges.ts`.
 */
const Chip: React.FC<{ children: React.ReactNode; className: string; shape?: string }> = ({
  children,
  className,
  shape = PRIORITY_SHAPE,
}) => (
  <span className={`inline-flex items-center border px-1.5 py-px text-[10px] font-medium leading-none ${shape} ${className}`}>
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
