'use client';

import React, { useMemo } from 'react';
import type { PlanSummary, FreeBlock } from '../../utils/dailyPlanUtils';
import { formatMinutes, formatTimeRange } from '../../utils/dailyPlanUtils';
import { CheckIcon } from '@/components/icons/CheckIcons';

interface FreeTimePanelProps {
  summary: PlanSummary;
}

const ClockIcon: React.FC = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

const ListIcon: React.FC = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const SparkIcon: React.FC = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

interface StatRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}

const StatRow: React.FC<StatRowProps> = ({ icon, label, value, valueClass }) => (
  <div className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
    <div className="flex items-center gap-2 text-muted-foreground">
      {icon}
      <span className="text-[12px] font-medium">{label}</span>
    </div>
    <span className={`text-[13px] font-semibold tabular-nums ${valueClass ?? 'text-foreground'}`}>{value}</span>
  </div>
);

export const FreeTimePanel: React.FC<FreeTimePanelProps> = React.memo(({ summary }) => {
  const { plannedCount, plannedMinutes, unplannedCount, topFreeBlock } = summary;

  const coverageLabel = useMemo(() => {
    if (plannedCount === 0) return 'Nothing planned yet';
    if (unplannedCount === 0) return 'All tasks planned!';
    return `${unplannedCount} task${unplannedCount === 1 ? '' : 's'} still free`;
  }, [plannedCount, unplannedCount]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">Summary</h3>
      </div>

      {/* Stats */}
      <div className="rounded-xl border border-border/50 bg-muted/20 px-3 divide-y-0">
        <StatRow
          icon={<CheckIcon size={13} />}
          label="Planned"
          value={`${plannedCount} task${plannedCount === 1 ? '' : 's'}`}
          valueClass={plannedCount > 0 ? 'text-primary' : 'text-muted-foreground'}
        />
        <StatRow
          icon={<ClockIcon />}
          label="Time planned"
          value={plannedMinutes > 0 ? formatMinutes(plannedMinutes) : '—'}
          valueClass={plannedMinutes > 0 ? 'text-foreground' : 'text-muted-foreground'}
        />
        <StatRow
          icon={<ListIcon />}
          label="Remaining"
          value={`${unplannedCount}`}
          valueClass={unplannedCount > 0 ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-500'}
        />
      </div>

      {/* Free block */}
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 mb-2">Best Free Window</h3>
        {topFreeBlock ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/8 px-4 py-3">
            <div className="flex items-center gap-2">
              <SparkIcon />
              <span className="text-[13px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatTimeRange(topFreeBlock.startTime, topFreeBlock.endTime)}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground/70 mt-1">
              {formatMinutes(topFreeBlock.durationMins)} available
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
            <p className="text-[12px] text-muted-foreground/60">No large free window found</p>
          </div>
        )}
      </div>

      {/* Coverage message */}
      <p className="text-[11px] text-muted-foreground/50 text-center px-2">{coverageLabel}</p>
    </div>
  );
});

FreeTimePanel.displayName = 'FreeTimePanel';
