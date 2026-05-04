'use client';

import React from 'react';
import type { CaptureType } from './classifier';

const PILL_DEFS: Array<{
  type: CaptureType;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    type: 'task',
    label: 'Task',
    icon: (
      <svg width={12} height={12} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="10" height="10" rx="2" />
        <path d="M5 7l1.5 1.5L9 5.5" />
      </svg>
    ),
  },
  {
    type: 'doc',
    label: 'Doc',
    icon: (
      <svg width={12} height={12} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 2H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4z" />
        <path d="M9 2v2h2" />
        <line x1="5" y1="7" x2="9" y2="7" />
        <line x1="5" y1="9" x2="8" y2="9" />
      </svg>
    ),
  },
  {
    type: 'event',
    label: 'Event',
    icon: (
      <svg width={12} height={12} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="10" height="9" rx="1.5" />
        <line x1="9" y1="2" x2="9" y2="4" />
        <line x1="5" y1="2" x2="5" y2="4" />
        <line x1="2" y1="6" x2="12" y2="6" />
      </svg>
    ),
  },
];

interface Props {
  active: CaptureType;
  onSelect: (type: CaptureType) => void;
}

export function QuickCaptureTypePills({ active, onSelect }: Props) {
  return (
    <div role="radiogroup" aria-label="Capture type" className="flex items-center gap-1.5">
      {PILL_DEFS.map((pill) => {
        const isActive = active === pill.type;
        return (
          <button
            key={pill.type}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onSelect(pill.type)}
            className={[
              'inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors',
              isActive
                ? 'qc-pill-active bg-primary/10 border-primary/40 text-primary font-medium'
                : 'border-border/40 text-muted-foreground bg-transparent hover:bg-muted/50 hover:text-foreground',
            ].join(' ')}
          >
            <span className="opacity-80">{pill.icon}</span>
            <span>{pill.label}</span>
          </button>
        );
      })}
    </div>
  );
}
