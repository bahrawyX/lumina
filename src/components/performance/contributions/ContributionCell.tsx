import React from 'react';
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
          className={`h-3 w-3 rounded-[3px] border transition-colors duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 ${contributionLevelClasses[day.level]}`}
          aria-label={`${dateForAria}, ${day.score} contributions`}
        />
      </TooltipTrigger>
      <TooltipContent side="top" align="center" className="max-w-[240px] p-2.5">
        <ContributionTooltip day={day} />
      </TooltipContent>
    </Tooltip>
  );
};

export default React.memo(ContributionCell);
