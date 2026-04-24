'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface AIPromptInputProps {
  position: { top: number; left: number };
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
}

/**
 * Inline AI prompt input rendered at the cursor position after the user
 * selects the "/ai" slash command. Escape cancels; Enter submits. Min 3 chars
 * mirrors the server-side validation so we never fire a doomed request.
 */
export default function AIPromptInput({ position, onSubmit, onCancel }: AIPromptInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length < 3) return;
    onSubmit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const canSend = value.trim().length >= 3;

  return (
    <div
      className={cn(
        'fixed z-[60] w-[320px] font-sans',
        'bg-card border border-border rounded-lg shadow-lg',
        'flex items-center gap-2 px-3 py-2',
      )}
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary shrink-0"
        aria-hidden="true"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M8 10h8" />
        <path d="M8 14h5" />
      </svg>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask AI anything..."
        aria-label="Ask AI anything"
        className={cn(
          'flex-1 min-w-0 bg-transparent border-none outline-none',
          'text-sm text-foreground placeholder:text-muted-foreground',
        )}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!canSend}
        aria-label="Send prompt"
        className={cn(
          'shrink-0 font-mono text-[10px] uppercase tracking-wider',
          'px-1.5 py-0.5 rounded border border-border/60 bg-muted/40',
          'transition-colors',
          canSend
            ? 'text-foreground hover:bg-muted cursor-pointer'
            : 'text-muted-foreground/60 cursor-not-allowed',
        )}
      >
        ↵ send
      </button>
    </div>
  );
}
