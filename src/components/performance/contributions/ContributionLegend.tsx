import React from 'react';
import { contributionLegendLevels, contributionLevelClasses } from './contributionTheme';

const ContributionLegend: React.FC = () => {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground/75">
      <span>Less</span>
      <div className="flex items-center gap-1">
        {contributionLegendLevels.map((level) => (
          <span
            key={level}
            className={`h-3 w-3 rounded-[3px] border ${contributionLevelClasses[level]}`}
            aria-hidden="true"
          />
        ))}
      </div>
      <span>More</span>
    </div>
  );
};

export default ContributionLegend;
