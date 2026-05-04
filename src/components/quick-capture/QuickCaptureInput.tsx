'use client';

import React, { forwardRef } from 'react';
import type { CaptureType } from './classifier';

const TYPE_ICON: Record<CaptureType, React.ReactNode> = {
  task: (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  ),
  doc: (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  ),
  event: (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
};

interface InputProps {
  type: CaptureType;
  value: string;
  onChange: (v: string) => void;
}

export const QuickCaptureInput = forwardRef<HTMLInputElement, InputProps>(
  function QuickCaptureInput({ type, value, onChange }, ref) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground/60 shrink-0 transition-colors">
          {TYPE_ICON[type]}
        </span>
        <input
          ref={ref}
          autoFocus
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Capture anything… task, doc, or event"
          aria-label="Quick capture"
          spellCheck={false}
          autoComplete="off"
          className="qc-input w-full bg-transparent text-base font-sans outline-none placeholder:italic placeholder:text-muted-foreground/45"
        />
      </div>
    );
  },
);
