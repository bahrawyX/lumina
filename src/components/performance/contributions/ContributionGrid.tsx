'use client';

import React, { useMemo } from 'react';
import { TooltipProvider } from '../../ui/tooltip';
import { ContributionYear } from '../../../types/performance';
import { getWeekdayLabels } from '../../../utils/performance/getWeekdayLabels';
import ContributionCell from './ContributionCell';

interface ContributionGridProps {
  data: ContributionYear;
}

const ContributionGrid: React.FC<ContributionGridProps> = ({ data }) => {
  const weekdayLabels = getWeekdayLabels();

  const flattenedDays = useMemo(() => {
    const cells: Array<{ key: string; day: (typeof data.weeks)[number]['days'][number] }> = [];
    data.weeks.forEach((week, colIdx) => {
      week.days.forEach((day, rowIdx) => {
        cells.push({
          key: day ? day.date : `pad-${colIdx}-${rowIdx}`,
          day,
        });
      });
    });
    return cells;
  }, [data.weeks]);

  return (
    <div className="overflow-x-auto no-scrollbar -mx-2 px-2">
    <div className="min-w-max">
      <div
        className="ml-8 grid mb-2"
        style={{ gridTemplateColumns: `repeat(${data.weeks.length}, minmax(0, 12px))`, columnGap: '4px' }}
      >
        {data.monthLabels.map((label) => (
          <span
            key={`${label.label}-${label.weekIndex}`}
            className="text-[10px] text-muted-foreground/70"
            style={{ gridColumn: `${label.weekIndex + 1} / span 1` }}
          >
            {label.label}
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative w-6 h-[108px]">
          {weekdayLabels.map((label) => (
            <span
              key={label.label}
              className="absolute left-0 text-[10px] text-muted-foreground/60"
              style={{ top: `${label.rowIndex * 16}px` }}
            >
              {label.label}
            </span>
          ))}
        </div>

        <TooltipProvider delayDuration={80}>
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${data.weeks.length}, minmax(0, 12px))`,
              gridTemplateRows: 'repeat(7, minmax(0, 12px))',
              gap: '4px',
            }}
          >
            {flattenedDays.map((cell) => (
              <ContributionCell key={cell.key} day={cell.day} />
            ))}
          </div>
        </TooltipProvider>
      </div>
    </div>
    </div>
  );
};

export default React.memo(ContributionGrid);
