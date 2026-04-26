/**
 * DifficultyBadge — visually distinct from the priority pill.
 *
 * Priority pill renders a coloured filled chip with just the label.
 * Difficulty pill renders a signal-bars icon (1/2/3 bars filled for
 * easy/medium/hard) followed by the label, so even when priority and
 * difficulty share the same text ("Medium") the two chips are never
 * confusable at a glance (see Bug #1).
 */
'use client';

import React from 'react';
import type { TaskDifficulty } from '../../types/task';
import { DIFFICULTY_META } from '../../utils/taskBadges';

export const FILLED_BARS: Record<TaskDifficulty, 1 | 2 | 3> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

export const SignalBarsIcon: React.FC<{ filled: 1 | 2 | 3 }> = ({ filled }) => (
  <svg
    width={10}
    height={10}
    viewBox="0 0 10 10"
    aria-hidden="true"
    className="flex-shrink-0"
  >
    <rect x={0} y={6} width={2} height={4} rx={0.5} fill="currentColor" opacity={filled >= 1 ? 1 : 0.25} />
    <rect x={4} y={3} width={2} height={7} rx={0.5} fill="currentColor" opacity={filled >= 2 ? 1 : 0.25} />
    <rect x={8} y={0} width={2} height={10} rx={0.5} fill="currentColor" opacity={filled >= 3 ? 1 : 0.25} />
  </svg>
);

export const DifficultyBadge: React.FC<{
  difficulty: TaskDifficulty | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
}> = ({ difficulty, size = 'md', className = '' }) => {
  if (!difficulty) return null;
  const d = difficulty;
  const meta = DIFFICULTY_META[d];
  const padding = size === 'sm' ? 'px-1.5 py-0.5 text-[10px] gap-1' : 'px-2 py-0.5 text-[11px] gap-1.5';
  return (
    <span
      data-testid="difficulty-badge"
      aria-label={`Difficulty: ${meta.label}`}
      className={`inline-flex items-center rounded-md border font-medium ${padding} ${meta.className} ${className}`}
    >
      <SignalBarsIcon filled={FILLED_BARS[d]} />
      {meta.label}
    </span>
  );
};

DifficultyBadge.displayName = 'DifficultyBadge';
