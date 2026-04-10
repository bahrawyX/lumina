'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface ColumnRatio {
  label: string;
  widths: number[];
}

export const COLUMN_RATIOS: ColumnRatio[] = [
  { label: '50 / 50', widths: [1, 1] },
  { label: '70 / 30', widths: [2.33, 1] },
  { label: '30 / 70', widths: [1, 2.33] },
  { label: '33 / 33 / 33', widths: [1, 1, 1] },
  { label: '50 / 25 / 25', widths: [2, 1, 1] },
  { label: '25 / 50 / 25', widths: [1, 2, 1] },
];

interface ColumnRatioPickerProps {
  onSelect: (ratio: ColumnRatio) => void;
  onClose: () => void;
}

export default function ColumnRatioPicker({ onSelect, onClose }: ColumnRatioPickerProps) {
  return (
    <div
      className={cn(
        'z-50 w-[280px]',
        'bg-popover/95 backdrop-blur-md border border-border/60 rounded-xl',
        'shadow-lg shadow-black/30 p-3',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Choose a layout
      </p>

      <div className="grid grid-cols-3 gap-2">
        {COLUMN_RATIOS.map((ratio) => {
          const total = ratio.widths.reduce((a, b) => a + b, 0);
          return (
            <button
              key={ratio.label}
              type="button"
              onClick={() => {
                onSelect(ratio);
                onClose();
              }}
              className={cn(
                'bg-muted rounded-lg p-2 cursor-pointer transition-all',
                'hover:bg-muted/80 hover:border-primary/30 hover:border',
                'border border-transparent',
                'flex flex-col items-center gap-1.5',
              )}
            >
              {/* Visual preview */}
              <div className="flex gap-0.5 w-full h-6">
                {ratio.widths.map((w, i) => (
                  <div
                    key={i}
                    className="bg-muted-foreground/20 rounded-sm h-full"
                    style={{ flex: w / total }}
                  />
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground leading-none whitespace-nowrap">
                {ratio.label}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground/60 text-center mt-2 md:hidden">
        Columns stack on mobile
      </p>
    </div>
  );
}
