import React from 'react';
import { format } from 'date-fns';
import { RollOverButton } from './RollOverButton';

interface DailyPlanHeaderProps {
  date: Date;
  plannedCount: number;
  unplannedCount: number;
  rolloverCount?: number;
  onAutoPlan?: () => void;
  onRollOver?: () => void;
  onToggleInsights?: () => void;
  insightsOpen?: boolean;
  isPlanning?: boolean;
  isRollingOver?: boolean;
}

const SunIcon: React.FC = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="2" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="4.22" y1="4.22" x2="7.05" y2="7.05" />
    <line x1="16.95" y1="16.95" x2="19.78" y2="19.78" />
    <line x1="2" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="22" y2="12" />
    <line x1="4.22" y1="19.78" x2="7.05" y2="16.95" />
    <line x1="16.95" y1="7.05" x2="19.78" y2="4.22" />
  </svg>
);

export const DailyPlanHeader: React.FC<DailyPlanHeaderProps> = React.memo(({ date, plannedCount, unplannedCount, rolloverCount = 0, onAutoPlan, onRollOver, onToggleInsights, insightsOpen, isPlanning, isRollingOver }) => {
  const dayLabel = format(date, 'EEEE');
  const dateLabel = format(date, 'MMMM d, yyyy');

  return (
    <div className="flex items-start justify-between pb-4 border-b border-border/50">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10 text-primary">
          <SunIcon />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground leading-none">
            {dayLabel}
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5 font-sans">{dateLabel}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 text-right">
        {onToggleInsights && (
          <button
            type="button"
            onClick={onToggleInsights}
            title={insightsOpen ? 'Close AI insights' : 'Open AI insights'}
            className={`flex items-center justify-center w-8 h-8 rounded-xl border transition-colors ${
              insightsOpen
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground'
            }`}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.3 4.7-3.3 6l-.7 3H9l-.7-3A7 7 0 0 1 5 9a7 7 0 0 1 7-7z"/>
              <line x1="9" y1="21" x2="15" y2="21"/>
            </svg>
          </button>
        )}
        {onRollOver && (
          <RollOverButton
            onClick={onRollOver}
            disabled={Boolean(isRollingOver) || rolloverCount === 0}
            isRolling={isRollingOver}
            rolloverCount={rolloverCount}
          />
        )}
        {onAutoPlan && (
          <button
            type="button"
            onClick={onAutoPlan}
            disabled={isPlanning || unplannedCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            title={unplannedCount === 0 ? 'No unscheduled tasks' : 'Auto-schedule unscheduled tasks'}
          >
            {isPlanning ? (
              <>
                <svg className="animate-spin" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Planning…
              </>
            ) : (
              'Plan My Day ✨'
            )}
          </button>
        )}
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-display text-2xl font-semibold text-foreground tabular-nums leading-none">{plannedCount}</span>
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">Planned</span>
        </div>
        <div className="w-px h-8 bg-border/60" />
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-display text-2xl font-semibold text-muted-foreground tabular-nums leading-none">{unplannedCount}</span>
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">Remaining</span>
        </div>
      </div>
    </div>
  );
});

DailyPlanHeader.displayName = 'DailyPlanHeader';
