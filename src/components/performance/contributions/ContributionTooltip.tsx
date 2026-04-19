import React from 'react';
import { format } from 'date-fns';
import { ContributionDay } from '../../../types/performance';

interface ContributionTooltipProps {
  day: ContributionDay;
}

const ContributionTooltip: React.FC<ContributionTooltipProps> = ({ day }) => {
  const prettyDate = format(new Date(`${day.date}T00:00:00`), 'EEEE, MMMM d, yyyy');

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold">{prettyDate}</p>
      <p className="text-[11px]">{day.score} contributions</p>
      <div className="mt-1 border-t border-background/20 pt-1 text-[10px] text-background/80">
        <p>Tasks completed: {day.completedTasks}</p>
        <p>Focus sessions: {day.focusSessions}</p>
        <p>Events scheduled: {day.scheduledEvents ?? 0}</p>
        {day.completedEvents > 0 && <p>Events completed: {day.completedEvents}</p>}
        {day.completedPlannerItems > 0 && <p>Planner items: {day.completedPlannerItems}</p>}
      </div>
    </div>
  );
};

export default ContributionTooltip;
