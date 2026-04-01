'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useContributionYear } from '../../../hooks/useContributionYear';
import ContributionGrid from './ContributionGrid';
import ContributionLegend from './ContributionLegend';
import ContributionYearSelector from './ContributionYearSelector';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Button } from '../../ui/button';
import { ChevronDownIcon } from '../../icons';

const ContributionHeatmap: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const baselineYear = 2026;
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const { contributionYear } = useContributionYear(selectedYear);

  const yearTabs = useMemo(() => {
    const endYear = currentYear >= baselineYear ? baselineYear : currentYear;
    const years: number[] = [];
    for (let y = currentYear; y >= endYear; y -= 1) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  const safeSelectedYear = yearTabs.includes(selectedYear)
    ? selectedYear
    : yearTabs[0] ?? currentYear;

  useEffect(() => {
    if (safeSelectedYear !== selectedYear) {
      setSelectedYear(safeSelectedYear);
    }
  }, [safeSelectedYear, selectedYear]);

  const tinyStat = useMemo(() => {
    if (contributionYear.bestStreak > 0) {
      return `Best streak: ${contributionYear.bestStreak} day${contributionYear.bestStreak === 1 ? '' : 's'}`;
    }

    if (contributionYear.mostActiveMonth) {
      return `Most active month: ${contributionYear.mostActiveMonth}`;
    }

    return 'No tracked activity yet for this year.';
  }, [contributionYear.bestStreak, contributionYear.mostActiveMonth]);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">
          {contributionYear.totalScore} contributions in the last year
          </h3>

          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 px-2.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Contribution settings
                  <ChevronDownIcon size={12} />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-3">
                <p className="text-xs font-semibold text-foreground">How contributions are counted</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Tasks +1, Focus sessions +2, Completed events +1, Completed planner items +1.
                </p>
                <div className="mt-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                  <p>Level 1: 1-2</p>
                  <p>Level 2: 3-4</p>
                  <p>Level 3: 5-7</p>
                  <p>Level 4: 8+</p>
                </div>
              </PopoverContent>
            </Popover>

            <ContributionYearSelector
              years={yearTabs}
              selectedYear={safeSelectedYear}
              onSelectYear={setSelectedYear}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground/70">{tinyStat}</p>
      </div>

      <div className="overflow-x-auto pb-1">
        <ContributionGrid data={contributionYear} />
      </div>

      <div className="mt-4 flex flex-col gap-2 text-[11px] text-muted-foreground/70 md:flex-row md:items-center md:justify-between">
        <p>Learn how we count contributions</p>
        <ContributionLegend />
      </div>
    </section>
  );
};

export default ContributionHeatmap;
