import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs';

interface ContributionYearSelectorProps {
  years: number[];
  selectedYear: number;
  onSelectYear: (year: number) => void;
}

const ContributionYearSelector: React.FC<ContributionYearSelectorProps> = ({
  years,
  selectedYear,
  onSelectYear,
}) => {
  return (
    <Tabs
      value={String(selectedYear)}
      onValueChange={(value) => onSelectYear(Number(value))}
      className="w-auto"
    >
      <TabsList className="h-9 rounded-md border border-border/60 bg-muted/30 p-1">
        {years.map((year) => (
          <TabsTrigger
            key={year}
            value={String(year)}
            className="h-7 px-3 text-xs data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none"
            aria-label={`Show contributions for ${year}`}
          >
            {year}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};

export default React.memo(ContributionYearSelector);
