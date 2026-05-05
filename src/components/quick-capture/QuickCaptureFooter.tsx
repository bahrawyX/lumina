'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
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
      <Button
        size="sm"
        onClick={onSubmit}
        disabled={!canSubmit}
        aria-label="Create"
        className="gap-1.5 h-7"
      >
        Create
        <kbd className={`text-[10px] font-mono px-1 rounded ${
          canSubmit ? 'bg-primary-foreground/10 text-primary-foreground/80' : ''
        }`}>
          ↵
        </kbd>
      </Button>
    </div>
  );
}
