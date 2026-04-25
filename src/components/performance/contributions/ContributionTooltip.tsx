import React from 'react';
import { format } from 'date-fns';
import { ContributionDay } from '../../../types/performance';

interface ContributionTooltipProps {
  day: ContributionDay;
  isToday?: boolean;
}

function formatDuration(mins: number): string {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const ContributionTooltip: React.FC<ContributionTooltipProps> = ({ day, isToday }) => {
  const prettyDate = format(new Date(`${day.date}T00:00:00`), 'EEEE, MMMM d, yyyy');

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold">
        {prettyDate}
        {isToday && <span className="ml-1.5 text-[10px] font-medium text-background/70">(today)</span>}
      </p>
      <p className="text-[11px]">{day.score} contributions</p>
      <div className="mt-1 border-t border-background/20 pt-1 text-[10px] text-background/80">
        <p>Tasks completed: {day.completedTasks}</p>
        <p>
          Focus sessions: {day.focusSessions}
          {day.focusMinutes > 0 && (
            <span className="ml-1 text-background/60">· {formatDuration(day.focusMinutes)}</span>
          )}
        </p>
        <p>Events scheduled: {day.scheduledEvents ?? 0}</p>
        {day.completedEvents > 0 && <p>Events completed: {day.completedEvents}</p>}
        {day.completedPlannerItems > 0 && <p>Planner items: {day.completedPlannerItems}</p>}
      </div>
    </div>
  );
};

export default ContributionTooltip;
