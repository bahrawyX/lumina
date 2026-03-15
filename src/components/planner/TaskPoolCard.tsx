'use client';

import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../../types/task';

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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-start gap-2.5 px-3 py-2.5 rounded-xl border bg-background select-none transition-all duration-[120ms] ease-out
        border-border/60 hover:border-primary/30 hover:bg-accent/30 focus-within:ring-2 focus-within:ring-primary/40
        ${isDragging ? 'shadow-elevated scale-[1.02]' : 'shadow-soft hover:-translate-y-[1px] hover:shadow-md'}`}
    >
      {/* Drag handle — only this part is draggable */}
      <div className="mt-[3px] flex-shrink-0 cursor-grab" {...attributes} {...listeners}>
        <GripIcon />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground leading-snug truncate">{task.title}</p>
        {task.description && (
          <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-relaxed line-clamp-1">{task.description}</p>
        )}
        {task.dueDate && (
          <span className="text-[10px] text-muted-foreground/50 mt-1 block">{task.dueDate}</span>
        )}
      </div>
      {/* Delete button — visible on hover */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
        title="Remove task"
        className="flex-shrink-0 mt-[2px] flex items-center justify-center w-5 h-5 rounded-md opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all duration-100"
      >
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
});

TaskPoolCard.displayName = 'TaskPoolCard';

// ── Drag ghost overlay (shown while dragging) ─────────────────────────────────
export const TaskPoolCardOverlay: React.FC<{ task: Task }> = React.memo(({ task }) => (
  <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-primary/40 bg-background shadow-elevated cursor-grabbing select-none opacity-95 max-w-[220px]">
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-foreground leading-snug truncate">{task.title}</p>
    </div>
  </div>
));

TaskPoolCardOverlay.displayName = 'TaskPoolCardOverlay';
