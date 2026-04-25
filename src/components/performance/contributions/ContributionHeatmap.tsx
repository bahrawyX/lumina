'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useContributionYear } from '../../../hooks/useContributionYear';
import ContributionGrid from './ContributionGrid';
import ContributionLegend from './ContributionLegend';
import ContributionYearSelector from './ContributionYearSelector';
import ContributionSettings from '../ContributionSettings';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Button } from '../../ui/button';
import { ChevronDownIcon } from '../../icons';

// Earliest year we ever surface as a selectable tab. Combined with whatever
// `availableYears` returns from the hook (which includes any year that has
// activity), so a brand-new user still sees the last few years to scroll
// through.
const MIN_VISIBLE_YEAR = 2024;

const ContributionHeatmap: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const { contributionYear, availableYears } = useContributionYear(selectedYear);

  const yearTabs = useMemo(() => {
    const set = new Set<number>(availableYears);
    set.add(currentYear);
    for (let y = currentYear; y >= MIN_VISIBLE_YEAR; y -= 1) set.add(y);
    return Array.from(set).sort((a, b) => b - a);
  }, [availableYears, currentYear]);

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
                  data-testid="contrib-settings-trigger"
                >
                  Contribution settings
                  <ChevronDownIcon size={12} />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-3">
                <ContributionSettings />
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

      <ContributionGrid data={contributionYear} />

      <div className="mt-4 flex flex-col gap-2 text-[11px] text-muted-foreground/70 md:flex-row md:items-center md:justify-between">
        <p>Learn how we count contributions</p>
        <ContributionLegend />
      </div>
    </section>
  );
};

export default ContributionHeatmap;
