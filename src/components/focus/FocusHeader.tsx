'use client';

import React from 'react';

interface FocusHeaderProps {
  taskTitle: string;
  onAttemptClose: () => void;
}

export const FocusHeader: React.FC<FocusHeaderProps> = ({ taskTitle, onAttemptClose }) => {

  return (
    <div className="w-full flex items-center justify-between">
      {/* Left: live indicator + label */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60 select-none">
          Deep Focus
        </span>
      </div>

      {/* Center: task name */}
      <p className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-foreground truncate max-w-[40%]">
        {taskTitle}
      </p>

      {/* Right: end button */}
      <button
        type="button"
        onClick={onAttemptClose}
        className="text-[11px] font-semibold text-muted-foreground/50 hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-accent"
      >
        End session
      </button>
    </div>
  );
};
