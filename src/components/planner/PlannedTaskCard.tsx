import React from 'react';
import type { Task } from '../../types/task';
import type { PlannedTaskItem } from '../../store/useDailyPlanStore';
import { formatTimeRange, durationMinutes, formatMinutes } from '../../utils/dailyPlanUtils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

interface PlannedTaskCardProps {
  planItem: PlannedTaskItem;
  task: Task | undefined;
  onRemove: (planItemId: string) => void;
  onDragHandlePointerDown: (e: React.PointerEvent) => void;
  isDragging?: boolean;
}

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

export const PlannedTaskCard: React.FC<PlannedTaskCardProps> = React.memo(({ planItem, task, onRemove, onDragHandlePointerDown, isDragging }) => {
  const durmins = durationMinutes(planItem.startTime, planItem.endTime);
  const timeLabel = formatTimeRange(planItem.startTime, planItem.endTime);

  return (
    <div
      onPointerDown={onDragHandlePointerDown}
      className={`group flex items-start gap-2 px-3 py-2.5 rounded-xl border select-none h-full overflow-hidden cursor-grab active:cursor-grabbing touch-none transition-all duration-[120ms] ease-out
        ${isDragging
          ? 'shadow-elevated scale-[1.02] border-primary/40 bg-primary/10 dark:bg-primary/12 ring-1 ring-primary/20'
          : 'shadow-soft hover:-translate-y-[1px] hover:shadow-md border-primary/20 bg-primary/5 dark:bg-primary/8'}`}
    >
      {/* Grip icon — visual only, drag is on the whole card */}
      <div className="mt-[2px] flex-shrink-0 p-0.5 pointer-events-none">
        <GripIcon />
      </div>

      <div className="min-w-0 flex-1">
        {durmins < 45 ? (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-[13px] font-semibold text-foreground leading-snug truncate cursor-default">
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
            <p className="text-[13px] font-semibold text-foreground leading-snug truncate">
              {task?.title ?? <span className="text-muted-foreground/40 italic">Deleted task</span>}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-medium text-primary/70 tabular-nums">{timeLabel}</span>
              <span className="text-[10px] text-muted-foreground/50">·</span>
              <span className="text-[10px] text-muted-foreground/60">{formatMinutes(durmins)}</span>
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onRemove(planItem.id)}
        className="mt-0.5 flex-shrink-0 p-1 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
        aria-label="Remove from plan"
      >
        <XIcon />
      </button>
    </div>
  );
});

PlannedTaskCard.displayName = 'PlannedTaskCard';
