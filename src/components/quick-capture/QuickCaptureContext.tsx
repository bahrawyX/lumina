'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { CaptureType } from './classifier';

interface ContextProps {
  type: CaptureType;
  // Task fields
  taskDueDate: Date | null;
  setTaskDueDate: (d: Date | null) => void;
  // Event fields
  eventDate: Date | null;
  setEventDate: (d: Date | null) => void;
  eventTime: string; // HH:mm
  setEventTime: (t: string) => void;
  eventDuration: number; // minutes
  setEventDuration: (m: number) => void;
}

const DURATION_OPTIONS: Array<{ minutes: number; label: string }> = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hr' },
  { minutes: 120, label: '2 hr' },
];

function toDateInputValue(d: Date | null): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDatePill(d: Date | null): string {
  if (!d) return 'Pick a date';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return target.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const fadeInOut = {
  initial: { opacity: 0, height: 0, y: -4 },
  animate: { opacity: 1, height: 'auto', y: 0 },
  exit: { opacity: 0, height: 0, y: -4 },
  transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const },
};

export function QuickCaptureContext(props: ContextProps) {
  return (
    <div className="qc-context-row">
      <AnimatePresence initial={false} mode="wait">
        {props.type === 'task' && (
          <motion.div key="task" {...fadeInOut} className="overflow-hidden">
            <div className="flex items-center gap-2 pt-2.5">
              <DatePill
                label="Due date"
                emptyLabel="Add due date"
                value={props.taskDueDate}
                onChange={props.setTaskDueDate}
              />
            </div>
          </motion.div>
        )}

        {props.type === 'event' && (
          <motion.div key="event" {...fadeInOut} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 pt-2.5">
              <DateTimePill
                date={props.eventDate}
                time={props.eventTime}
                onDateChange={props.setEventDate}
                onTimeChange={props.setEventTime}
              />
              <div className="inline-flex items-center gap-1 rounded-full border border-border/40 p-0.5 bg-transparent">
                {DURATION_OPTIONS.map((opt) => {
                  const isActive = props.eventDuration === opt.minutes;
                  return (
                    <button
                      key={opt.minutes}
                      type="button"
                      onClick={() => props.setEventDuration(opt.minutes)}
                      className={[
                        'text-[11px] px-2 py-0.5 rounded-full transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* Doc has no extra fields */}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function DatePill({
  label,
  emptyLabel,
  value,
  onChange,
}: {
  label: string;
  emptyLabel: string;
  value: Date | null;
  onChange: (d: Date | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={[
            'inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors',
            value
              ? 'border-primary/30 text-foreground bg-primary/5'
              : 'border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/40',
          ].join(' ')}
        >
          <svg width={11} height={11} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="10" height="9" rx="1.5" />
            <line x1="2" y1="6" x2="12" y2="6" />
          </svg>
          {value ? formatDatePill(value) : emptyLabel}
          {value && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear date"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(null);
                }
              }}
              className="ml-1 -mr-1 opacity-50 hover:opacity-100 cursor-pointer"
            >
              <svg width={10} height={10} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                <line x1="4" y1="4" x2="10" y2="10" />
                <line x1="10" y1="4" x2="4" y2="10" />
              </svg>
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <input
          type="date"
          autoFocus
          value={toDateInputValue(value)}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) {
              onChange(null);
              return;
            }
            const [y, m, d] = v.split('-').map(Number);
            const next = new Date(y, m - 1, d);
            onChange(next);
            setOpen(false);
          }}
          className="bg-transparent text-sm outline-none"
        />
      </PopoverContent>
    </Popover>
  );
}

function DateTimePill({
  date,
  time,
  onDateChange,
  onTimeChange,
}: {
  date: Date | null;
  time: string;
  onDateChange: (d: Date | null) => void;
  onTimeChange: (t: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const filled = date !== null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Pick date and time"
          className={[
            'inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors',
            filled
              ? 'border-primary/30 text-foreground bg-primary/5'
              : 'border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/40',
          ].join(' ')}
        >
          <svg width={11} height={11} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7" cy="7" r="5.5" />
            <polyline points="7 4 7 7 9 8.5" />
          </svg>
          {filled ? `${formatDatePill(date)} · ${time}` : 'When?'}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3 space-y-2">
        <label className="block text-[11px] uppercase tracking-wide text-muted-foreground/70 font-mono">
          Date
        </label>
        <input
          type="date"
          autoFocus
          value={toDateInputValue(date)}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) {
              onDateChange(null);
              return;
            }
            const [y, m, d] = v.split('-').map(Number);
            onDateChange(new Date(y, m - 1, d));
          }}
          className="block w-full bg-transparent text-sm outline-none border border-border/40 rounded-md px-2 py-1"
        />
        <label className="block text-[11px] uppercase tracking-wide text-muted-foreground/70 font-mono">
          Time
        </label>
        <input
          type="time"
          value={time}
          onChange={(e) => onTimeChange(e.target.value)}
          className="block w-full bg-transparent text-sm outline-none border border-border/40 rounded-md px-2 py-1"
        />
      </PopoverContent>
    </Popover>
  );
}
