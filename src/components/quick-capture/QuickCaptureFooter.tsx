'use client';

import React from 'react';
import type { CaptureType } from './classifier';

interface FooterProps {
  type: CaptureType;
  hasInput: boolean;
  hasDate: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
}

function hintFor(type: CaptureType, hasInput: boolean, hasDate: boolean): string {
  if (!hasInput) return 'Type anything to get started';
  switch (type) {
    case 'task':
      return hasDate
        ? 'Creates a task with the chosen due date on your board'
        : 'Creates a task on your board + daily planner';
    case 'doc':
      return 'Creates a new doc and opens it';
    case 'event':
      return hasDate
        ? 'Adds to your calendar + daily planner'
        : 'Add a date to create your event';
  }
}

export function QuickCaptureFooter({
  type,
  hasInput,
  hasDate,
  canSubmit,
  onSubmit,
}: FooterProps) {
  return (
    <div className="flex items-center justify-between gap-3 pt-3 mt-3 border-t border-border/40">
      <p className="text-[11px] text-muted-foreground/70 leading-relaxed flex-1 truncate">
        {hintFor(type, hasInput, hasDate)}
      </p>
      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        aria-label="Create"
        className={[
          'inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors',
          canSubmit
            ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
            : 'bg-muted/30 text-muted-foreground/60 border-border/40 cursor-not-allowed',
        ].join(' ')}
      >
        <span>Create</span>
        <kbd className={[
          'text-[10px] font-mono px-1.5 py-0.5 rounded border',
          canSubmit ? 'border-primary-foreground/30 text-primary-foreground/80' : 'border-border/40 text-muted-foreground/60',
        ].join(' ')}>
          ↵
        </kbd>
      </button>
    </div>
  );
}
