import React from 'react';
import type { Task, TaskDifficulty } from '../../types/task';
import type { PlannedTaskItem } from '../../store/useDailyPlanStore';
import { formatTimeRange, durationMinutes, formatMinutes } from '../../utils/dailyPlanUtils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

interface PlannedTaskCardProps {
  planItem: PlannedTaskItem;
  task: Task | undefined;
  onRemove: (planItemId: string) => void;
  onMarkDone?: (taskId: string) => void;
  onDragHandlePointerDown: (e: React.PointerEvent) => void;
  isDragging?: boolean;
  /** Number of subtasks (shown as badge) */
  subtaskCount?: number;
}

const DIFF_STYLE: Record<TaskDifficulty, string> = {
  easy: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  medium: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  hard: 'text-destructive bg-destructive/10',
};
const DIFF_LABEL: Record<TaskDifficulty, string> = { easy: 'E', medium: 'M', hard: 'H' };

const GripIcon: React.FC = () => (
  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-primary/40">
    <circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" />
    <circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />
  </svg>
);

const XIcon: React.FC = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const PlannedTaskCard: React.FC<PlannedTaskCardProps> = React.memo(({ planItem, task, onRemove, onMarkDone, onDragHandlePointerDown, isDragging, subtaskCount }) => {
  const durmins = durationMinutes(planItem.startTime, planItem.endTime);
  const timeLabel = formatTimeRange(planItem.startTime, planItem.endTime);
  const isDone = task?.status === 'done';

  return (
    <div
      onPointerDown={onDragHandlePointerDown}
      className={`group flex items-start gap-1 px-1.5 py-1 rounded-xl border select-none h-full overflow-hidden cursor-grab active:cursor-grabbing touch-none transition-all duration-[120ms] ease-out
        ${isDragging
          ? 'shadow-elevated scale-[1.02] border-primary/40 bg-primary/10 dark:bg-primary/12 ring-1 ring-primary/20'
          : 'shadow-soft hover:-translate-y-[1px] hover:shadow-md border-primary/20 bg-primary/5 dark:bg-primary/8'}`}
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          if (task?.id) {
            onMarkDone?.(task.id);
          }
        }}
        disabled={!task?.id}
        className={`mt-[1px] flex-shrink-0 w-5 h-5 md:w-4 md:h-4 rounded-md md:rounded-full border transition-colors ${
          isDone
            ? 'bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600 hover:border-emerald-600'
            : 'border-primary/35 text-transparent hover:border-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-600'
        }`}
        aria-label={isDone ? 'Mark task as not done' : 'Mark task as done'}
        title={isDone ? 'Click to undo' : 'Mark done'}
      >
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>

      {/* Grip icon — visual only, drag is on the whole card */}
      <div className="mt-[1px] flex-shrink-0 p-0.5 pointer-events-none">
        <GripIcon />
      </div>

      <div className="min-w-0 flex-1">
        {durmins < 45 ? (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className={`text-[11px] font-medium leading-snug truncate cursor-default ${isDone ? 'text-muted-foreground/60 line-through' : 'text-foreground'}`}>
                  {task?.title ?? <span className="text-muted-foreground/40 italic">Deleted task</span>}
                </p>
              </TooltipTrigger>
              <TooltipContent side="top">
                {task?.title ?? 'Deleted task'} · {timeLabel} ({formatMinutes(durmins)})
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <>
            <p className={`text-[11px] font-medium leading-snug truncate ${isDone ? 'text-muted-foreground/60 line-through' : 'text-foreground'}`}>
              {task?.title ?? <span className="text-muted-foreground/40 italic">Deleted task</span>}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[8px] font-medium text-primary/70 tabular-nums">{timeLabel}</span>
              <span className="text-[8px] text-muted-foreground/50">·</span>
              <span className="text-[8px] text-muted-foreground/60">{formatMinutes(durmins)}</span>
              {task?.difficulty && (
                <>
                  <span className="text-[8px] text-muted-foreground/50">·</span>
                  <span className={`text-[8px] font-semibold px-1 rounded ${DIFF_STYLE[task.difficulty]}`}>
                    {DIFF_LABEL[task.difficulty]}
                  </span>
                </>
              )}
              {subtaskCount != null && subtaskCount > 0 && (
                <>
                  <span className="text-[8px] text-muted-foreground/50">·</span>
                  <span className="text-[8px] text-muted-foreground/60 bg-muted/40 px-1 rounded">
                    {subtaskCount} sub
                  </span>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onRemove(planItem.id)}
        className="mt-0.5 flex-shrink-0 w-5 h-5 md:w-4 md:h-4 p-0 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
        aria-label="Remove from plan"
      >
        <XIcon />
      </button>
    </div>
  );
});

PlannedTaskCard.displayName = 'PlannedTaskCard';
