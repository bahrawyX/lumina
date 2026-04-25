import React from 'react';
import { format } from 'date-fns';
import { ContributionDay } from '../../../types/performance';
import { contributionLevelClasses } from './contributionTheme';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import ContributionTooltip from './ContributionTooltip';

interface ContributionCellProps {
  day: ContributionDay | null;
}

const ContributionCell: React.FC<ContributionCellProps> = ({ day }) => {
  if (!day) {
    return <span className="h-3 w-3 rounded-[3px]" aria-hidden="true" />;
  }

  const today = format(new Date(), 'yyyy-MM-dd');
  const isToday = day.date === today;

  const dateForAria = new Date(`${day.date}T00:00:00`).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-today={isToday ? 'true' : undefined}
          className={`h-3 w-3 rounded-[3px] border transition-colors duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 ${contributionLevelClasses[day.level]} ${isToday ? 'ring-2 ring-foreground/70 ring-offset-1 ring-offset-card' : ''}`}
          aria-label={`${dateForAria}, ${day.score} contributions${isToday ? ' (today)' : ''}`}
        />
      </TooltipTrigger>
      <TooltipContent side="top" align="center" className="max-w-[240px] p-2.5" collisionPadding={8}>
        <ContributionTooltip day={day} isToday={isToday} />
      </TooltipContent>
    </Tooltip>
  );
};

export default React.memo(ContributionCell);
