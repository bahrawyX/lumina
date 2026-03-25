'use client';

import React, { useEffect, useState } from 'react';
import EmojiPicker, { type EmojiClickData, Theme } from 'emoji-picker-react';
import type { CalendarEvent } from '../../types';
import type { Task, TaskStatus } from '../../types/task';
import { COLUMNS } from '../../types/task';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { Input } from '../ui/input';
import { MobileBottomSheet } from '../ui/MobileBottomSheet';
import { formatDateOnly, normalizeDueDateString, parseDateOnly } from '../../utils/taskBoard';

// ── Close icon ────────────────────────────────────────────────────────────────

const XIcon: React.FC = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskDialogPayload {
  title: string;
  description?: string;
  status: TaskStatus;
  durationMinutes: number;
  dueDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

interface TaskDialogProps {
  open: boolean;
  task?: Task | null;             // null/undefined = create mode
  linkedEvent?: CalendarEvent | null;
  defaultStatus?: TaskStatus;
  onSave: (payload: TaskDialogPayload) => void;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const TaskDialog: React.FC<TaskDialogProps> = ({
  open, task, linkedEvent, defaultStatus = 'todo', onSave, onClose,
}) => {
  const isEdit = Boolean(task);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [dueDate, setDueDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [titleError, setTitleError] = useState(false);
  const [timeError, setTimeError] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  // Sync form when task changes or dialog opens
  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? '');
      setDescription(task?.description ?? '');
      setStatus(task?.status ?? defaultStatus);
      setDurationMinutes(task?.durationMinutes ?? 30);
      setDueDate(normalizeDueDateString(task?.dueDate) ?? '');
      setStartTime(linkedEvent?.startTime ?? '');
      setEndTime(linkedEvent?.endTime ?? '');
      setTitleError(false);
      setTimeError(false);
      setDatePickerOpen(false);
      setEmojiPickerOpen(false);
    }
  }, [open, task, linkedEvent, defaultStatus]);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    const emoji = emojiData.emoji;
    setTitle((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${emoji} ${trimmed}` : emoji;
    });
    setEmojiPickerOpen(false);
  };

  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError(true);
      return;
    }

    if ((startTime && !endTime) || (!startTime && endTime)) {
      setTimeError(true);
      return;
    }

    if (startTime && endTime && endTime <= startTime) {
      setTimeError(true);
      return;
    }

    onSave({
      title: trimmed,
      description: description.trim() || undefined,
      status,
      durationMinutes,
      dueDate: normalizeDueDateString(dueDate),
      startTime: startTime || null,
      endTime: endTime || null,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave();
    if (e.key === 'Escape') onClose();
  };

  return (
    <MobileBottomSheet
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit task' : 'Create task'}
      className="md:bg-card md:border-border/70"
      contentClassName="flex flex-col gap-5"
    >
      <div onKeyDown={handleKeyDown}>
              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-foreground tracking-[-0.01em]">
                  {isEdit ? 'Edit Task' : 'New Task'}
                </h2>
                <button
                  onClick={onClose}
                  className="p-2.5 min-h-11 min-w-11 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="Close dialog"
                >
                  <XIcon />
                </button>
              </div>

              {/* Fields */}
              <div className="flex flex-col gap-4">
                {/* Title */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="task-title" className="text-xs font-medium text-muted-foreground">
                    Title <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="task-title"
                      autoFocus
                      placeholder="What needs to be done?"
                      value={title}
                      onChange={e => { setTitle(e.target.value); if (titleError) setTitleError(false); }}
                      className={`h-9 pr-10 text-sm rounded-xl ${titleError ? 'border-destructive ring-destructive/30' : ''}`}
                    />
                    <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label="Insert emoji"
                          className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground hover:bg-white/[0.07] transition-colors"
                        >
                          😊
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-auto p-0 border-white/10 bg-zinc-950/90 backdrop-blur-md">
                        <EmojiPicker
                          theme={Theme.DARK}
                          onEmojiClick={handleEmojiClick}
                          width={300}
                          height={360}
                          previewConfig={{ showPreview: false }}
                          lazyLoadEmojis
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  {titleError && (
                    <p className="text-[11px] text-destructive">Title is required.</p>
                  )}
                </div>

                {/* Description */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="task-desc" className="text-xs font-medium text-muted-foreground">
                    Description
                  </Label>
                  <Textarea
                    id="task-desc"
                    placeholder="Add more context... (optional)"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={3}
                    className="text-sm rounded-xl resize-none"
                  />
                </div>

                {/* Manual schedule times */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="task-start-time" className="text-xs font-medium text-muted-foreground">
                      Start Time
                    </Label>
                    <Input
                      id="task-start-time"
                      type="time"
                      value={startTime}
                      onChange={(e) => {
                        setStartTime(e.target.value);
                        if (timeError) setTimeError(false);
                      }}
                      className="h-9 text-sm rounded-xl bg-white/[0.02]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="task-end-time" className="text-xs font-medium text-muted-foreground">
                      End Time
                    </Label>
                    <Input
                      id="task-end-time"
                      type="time"
                      value={endTime}
                      onChange={(e) => {
                        setEndTime(e.target.value);
                        if (timeError) setTimeError(false);
                      }}
                      className="h-9 text-sm rounded-xl bg-white/[0.02]"
                    />
                  </div>
                </div>
                {timeError && (
                  <p className="text-[11px] text-destructive">End time must be after start time, and both times are required if one is set.</p>
                )}

                {/* Status + Duration row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Status</Label>
                    <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                      <SelectTrigger className="h-9 text-sm rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COLUMNS.map(col => (
                          <SelectItem key={col.id} value={col.id}>{col.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Duration</Label>
                    <Select value={String(durationMinutes)} onValueChange={(v) => setDurationMinutes(Number(v))}>
                      <SelectTrigger className="h-9 text-sm rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 min</SelectItem>
                        <SelectItem value="30">30 min</SelectItem>
                        <SelectItem value="45">45 min</SelectItem>
                        <SelectItem value="60">1 h</SelectItem>
                        <SelectItem value="90">1 h 30 m</SelectItem>
                        <SelectItem value="120">2 h</SelectItem>
                        <SelectItem value="180">3 h</SelectItem>
                        <SelectItem value="240">4 h</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Due date */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Due Date <span className="text-muted-foreground/50">(optional)</span>
                  </Label>
                  <div className="flex items-center gap-2">
                    <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="h-9 flex-1 flex items-center gap-2 px-3 text-sm rounded-xl border border-input bg-background text-left hover:bg-accent/40 transition-colors"
                        >
                          <svg className="h-4 w-4 text-muted-foreground flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                          <span className={dueDate ? 'text-foreground' : 'text-muted-foreground'}>
                            {formatDateOnly(dueDate) ?? 'Pick a date'}
                          </span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={parseDateOnly(dueDate) ?? undefined}
                          onSelect={(date) => {
                            if (date) {
                              const y = date.getFullYear();
                              const m = String(date.getMonth() + 1).padStart(2, '0');
                              const d = String(date.getDate()).padStart(2, '0');
                              setDueDate(`${y}-${m}-${d}`);
                            } else {
                              setDueDate('');
                            }
                            setDatePickerOpen(false);
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {dueDate && (
                      <button
                        type="button"
                        onClick={() => setDueDate('')}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-input text-muted-foreground/60 hover:text-foreground hover:bg-accent/40 transition-colors"
                        aria-label="Clear due date"
                      >
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="ghost" size="sm" onClick={onClose} className="rounded-xl">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  className="rounded-xl px-5"
                >
                  {isEdit ? 'Save changes' : 'Create task'}
                </Button>
              </div>

              <p className="text-[10px] text-muted-foreground/50 text-right -mt-3">
                Ctrl+Enter to save
              </p>
      </div>
    </MobileBottomSheet>
  );
};
