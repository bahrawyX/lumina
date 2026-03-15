'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import type { CalendarEvent } from '../../types';
import type { Task } from '../../types/task';
import { Calendar } from '../ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import TimePicker from '../TimePicker';
import {
  formatDateOnly,
  getDurationMinutes,
  normalizeDueDateString,
  parseDateOnly,
} from '../../utils/taskBoard';

export interface TaskSchedulePayload {
  date: string;
  startTime: string;
  durationMinutes: number;
}

interface TaskScheduleDialogProps {
  open: boolean;
  task: Task | null;
  linkedEvent?: CalendarEvent | null;
  onClose: () => void;
  onSchedule: (payload: TaskSchedulePayload) => void;
}

const DURATION_OPTIONS = [30, 45, 60, 90, 120];

export const TaskScheduleDialog: React.FC<TaskScheduleDialogProps> = ({
  open,
  task,
  linkedEvent,
  onClose,
  onSchedule,
}) => {
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const today = format(new Date(), 'yyyy-MM-dd');
    const linkedDate = normalizeDueDateString(linkedEvent?.date);
    setDate(linkedDate ?? today);
    setStartTime(linkedEvent?.startTime ?? '09:00');
    setDurationMinutes(linkedEvent ? getDurationMinutes(linkedEvent.startTime, linkedEvent.endTime) : 60);
    setDatePickerOpen(false);
  }, [open, linkedEvent?.date, linkedEvent?.startTime, linkedEvent?.endTime]);

  const selectedDate = useMemo(() => parseDateOnly(date) ?? undefined, [date]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-w-md overflow-hidden rounded-2xl border-border/70 p-0">
        <div className="space-y-5 p-6">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="font-display text-lg font-semibold tracking-[-0.01em]">
              {linkedEvent ? 'Reschedule in Calendar' : 'Schedule in Calendar'}
            </DialogTitle>
            <DialogDescription>
              Block time for {task?.title ?? 'this task'} in your Lumina calendar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Date</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-9 w-full rounded-xl border border-input bg-background px-3 text-left text-sm hover:bg-accent/40 transition-colors"
                  >
                    <span className={date ? 'text-foreground' : 'text-muted-foreground'}>
                      {formatDateOnly(date) ?? 'Pick a date'}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(nextDate) => {
                      if (nextDate) {
                        setDate(format(nextDate, 'yyyy-MM-dd'));
                      }
                      setDatePickerOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <TimePicker label="Start time" value={startTime} onChange={setStartTime} />

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Duration</Label>
              <Select value={String(durationMinutes)} onValueChange={(value) => setDurationMinutes(Number(value))}>
                <SelectTrigger className="h-9 rounded-xl text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {minutes < 60
                        ? `${minutes} min`
                        : minutes % 60 === 0
                          ? `${minutes / 60} h`
                          : `${Math.floor(minutes / 60)} h ${minutes % 60} m`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border/60 bg-muted/20 px-6 py-4">
          <Button variant="ghost" onClick={onClose} className="rounded-xl">
            Cancel
          </Button>
          <Button
            onClick={() => onSchedule({ date, startTime, durationMinutes })}
            className="rounded-xl"
            disabled={!date}
          >
            {linkedEvent ? 'Reschedule' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
