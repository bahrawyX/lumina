'use client';

import React from 'react';
import {
  ScoringSource,
  useContributionSettingsStore,
} from '@/store/useContributionSettingsStore';
import { DEFAULT_CONTRIBUTION_WEIGHTS } from '@/types/performance';

const ROWS: Array<{ key: ScoringSource; label: string }> = [
  { key: 'completedTasks',        label: 'Tasks done' },
  { key: 'focusSessions',         label: 'Focus sessions' },
  { key: 'scheduledEvents',       label: 'Scheduled events' },
  { key: 'completedEvents',       label: 'Completed events' },
  { key: 'completedPlannerItems', label: 'Planner items' },
];

const ContributionSettings: React.FC = () => {
  const enabled = useContributionSettingsStore((s) => s.enabled);
  const toggle = useContributionSettingsStore((s) => s.toggle);
  const reset = useContributionSettingsStore((s) => s.reset);

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold text-foreground">Scoring</p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Toggle which activities count towards your contribution score.
        </p>
      </div>

      <div className="space-y-1.5 border-t border-border/60 pt-2">
        {ROWS.map((row) => {
          const on = enabled[row.key];
          return (
            <label
              key={row.key}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-1 py-1 text-[11px] hover:bg-muted/40"
              data-testid={`contrib-toggle-${row.key}`}
            >
              <span className="text-foreground">{row.label}</span>
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  +{DEFAULT_CONTRIBUTION_WEIGHTS[row.key]}
                </span>
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 cursor-pointer accent-primary"
                  checked={on}
                  onChange={() => toggle(row.key)}
                  aria-label={`Toggle ${row.label}`}
                />
              </span>
            </label>
          );
        })}
      </div>

      <div className="border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
        <p>Level 1: 1-2 · Level 2: 3-4 · Level 3: 5-7 · Level 4: 8+</p>
      </div>

      <button
        type="button"
        onClick={reset}
        className="w-full rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      >
        Reset to defaults
      </button>
    </div>
  );
};

export default ContributionSettings;
