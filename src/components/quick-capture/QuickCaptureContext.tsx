'use client';

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useGoalsStore } from '@/store/useGoalsStore';
import type { CaptureType } from './classifier';

interface ContextProps {
  type: CaptureType;
  taskDueDate: Date | null;
  setTaskDueDate: (d: Date | null) => void;
  eventDate: Date | null;
  setEventDate: (d: Date | null) => void;
  eventTime: string;
  setEventTime: (t: string) => void;
  eventDuration: number;
  setEventDuration: (m: number) => void;
  goalId: string | null;
  setGoalId: (id: string | null) => void;
}

function formatDatePill(d: Date | null): string {
  if (!d) return '';
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

const todayStart = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

export function QuickCaptureContext(props: ContextProps) {
  const allGoals = useGoalsStore((s) => s.goals);
  const activeGoals = useMemo(
    () => allGoals.filter((g) => g.status === 'active'),
    [allGoals],
  );

  return (
    <div className="qc-context-row">
      <AnimatePresence initial={false} mode="wait">
        {props.type === 'task' && (
          <motion.div key="task" {...fadeInOut} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 pt-2.5">
              <DatePickerButton
                value={props.taskDueDate}
                onChange={props.setTaskDueDate}
                emptyLabel="Add due date"
              />
              {activeGoals.length > 0 && (
                <Select
                  value={props.goalId ?? ''}
                  onValueChange={(v) => props.setGoalId(v || null)}
                >
                  <SelectTrigger className="h-7 text-xs w-auto min-w-[140px] max-w-[200px]">
                    <SelectValue placeholder="Link to goal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No goal</SelectItem>
                    {activeGoals.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </motion.div>
        )}

        {props.type === 'event' && (
          <motion.div key="event" {...fadeInOut} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 pt-2.5">
              <DateTimePickerButton
                date={props.eventDate}
                time={props.eventTime}
                onDateChange={props.setEventDate}
                onTimeChange={props.setEventTime}
              />
              <Select
                value={String(props.eventDuration)}
                onValueChange={(v) => props.setEventDuration(Number(v))}
              >
                <SelectTrigger className="h-7 text-xs w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DatePickerButton({
  value,
  onChange,
  emptyLabel,
}: {
  value: Date | null;
  onChange: (d: Date | null) => void;
  emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`gap-1.5 text-xs h-7 font-normal ${
            value ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          <svg width={12} height={12} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="10" height="9" rx="1.5" />
            <line x1="2" y1="6" x2="12" y2="6" />
          </svg>
          {value ? formatDatePill(value) : emptyLabel}
          {value && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear date"
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault(); e.stopPropagation(); onChange(null);
                }
              }}
              className="ml-0.5 -mr-1 opacity-50 hover:opacity-100 cursor-pointer"
            >
              <svg width={10} height={10} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                <line x1="4" y1="4" x2="10" y2="10" />
                <line x1="10" y1="4" x2="4" y2="10" />
              </svg>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={(d) => {
            onChange(d ?? null);
            setOpen(false);
          }}
          disabled={(date) => date < todayStart}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

function DateTimePickerButton({
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`gap-1.5 text-xs h-7 font-normal ${
            filled ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          <svg width={12} height={12} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7" cy="7" r="5.5" />
            <polyline points="7 4 7 7 9 8.5" />
          </svg>
          {filled ? `${formatDatePill(date)} · ${time}` : 'When?'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date ?? undefined}
          onSelect={(d) => {
            onDateChange(d ?? null);
          }}
          disabled={(d) => d < todayStart}
          autoFocus
        />
        <div className="border-t border-border px-3 py-2">
          <label className="block text-[11px] uppercase tracking-wide text-muted-foreground/70 font-mono mb-1">
            Time
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            className="block w-full bg-transparent text-sm outline-none border border-border/40 rounded-md px-2 py-1"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
