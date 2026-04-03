'use client';

import React, { useEffect, useState } from 'react';
import { CompactEmojiPicker } from '../ui/CompactEmojiPicker';
import type { CalendarEvent } from '../../types';
import type { Task, TaskStatus, TaskDifficulty } from '../../types/task';
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
import { titleSchema, getFieldError } from '../../lib/validation';

// ── Close icon ────────────────────────────────────────────────────────────────

const XIcon: React.FC = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ── Difficulty config ─────────────────────────────────────────────────────────

const DIFFICULTY_OPTIONS: { value: TaskDifficulty; label: string; activeClass: string; inactiveClass: string }[] = [
  {
    value: 'easy',
    label: 'Easy',
    activeClass: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
    inactiveClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-transparent hover:bg-emerald-500/15',
  },
  {
    value: 'medium',
    label: 'Medium',
    activeClass: 'bg-amber-500/20 border-amber-500/40 text-amber-600 dark:text-amber-400',
    inactiveClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-transparent hover:bg-amber-500/15',
  },
  {
    value: 'hard',
    label: 'Hard',
    activeClass: 'bg-destructive/20 border-destructive/40 text-destructive',
    inactiveClass: 'bg-destructive/10 text-destructive border-transparent hover:bg-destructive/15',
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskDialogPayload {
  title: string;
  description?: string;
  status: TaskStatus;
  difficulty: TaskDifficulty;
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
  const [difficulty, setDifficulty] = useState<TaskDifficulty>('medium');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [dueDate, setDueDate] = useState('');
  const [titleError, setTitleError] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  // Sync form when task changes or dialog opens
  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? '');
      setDescription(task?.description ?? '');
      setStatus(task?.status ?? defaultStatus);
      setDifficulty(task?.difficulty ?? 'medium');
      setDurationMinutes(task?.durationMinutes ?? 30);
      setDueDate(normalizeDueDateString(task?.dueDate) ?? '');
      setTitleError('');
      setDatePickerOpen(false);
      setEmojiPickerOpen(false);
    }
  }, [open, task, linkedEvent, defaultStatus]);

  const handleEmojiClick = (emoji: string) => {
    setTitle((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${emoji} ${trimmed}` : emoji;
    });
    setEmojiPickerOpen(false);
  };

  const handleSave = () => {
    const titleErr = getFieldError(titleSchema, title);
    if (titleErr) { setTitleError(titleErr); return; }

    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      difficulty,
      durationMinutes,
      dueDate: normalizeDueDateString(dueDate),
      startTime: null,
      endTime: null,
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
                  className="p-2.5 min-h-11 min-w-11 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
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
                      placeholder="Task name"
                      value={title}
                      onChange={e => { setTitle(e.target.value); if (titleError) setTitleError(''); }}
                      className={`h-9 pr-10 text-sm rounded-lg ${titleError ? 'border-destructive ring-1 ring-destructive/30' : ''}`}
                    />
                    <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label="Insert emoji"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-[13px]"
                        >
                          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" sideOffset={6} className="w-auto p-0 border-0 bg-transparent shadow-none">
                        <CompactEmojiPicker onSelect={handleEmojiClick} />
                      </PopoverContent>
                    </Popover>
                  </div>
                  {titleError && (
                    <p className="text-[11px] text-destructive">{titleError}</p>
                  )}
                </div>

                {/* Description */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="task-desc" className="text-xs font-medium text-muted-foreground">
                    Description
                  </Label>
                  <Textarea
                    id="task-desc"
                    placeholder="Notes, links, details…"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={3}
                    className="text-sm rounded-lg resize-none"
                  />
                </div>

                {/* Difficulty pills */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Difficulty</Label>
                  <div className="flex gap-2">
                    {DIFFICULTY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDifficulty(opt.value)}
                        className={`rounded-lg px-4 py-1.5 text-sm font-medium border transition-colors ${
                          difficulty === opt.value ? opt.activeClass : opt.inactiveClass
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Status + Duration row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Status</Label>
                    <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                      <SelectTrigger className="h-10 md:h-9 text-sm rounded-lg">
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
                      <SelectTrigger className="h-10 md:h-9 text-sm rounded-lg">
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
                          className="h-9 flex-1 flex items-center gap-2 px-3 text-sm rounded-lg border border-input bg-background text-left hover:bg-accent/40 transition-colors"
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
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-input text-muted-foreground/60 hover:text-foreground hover:bg-accent/40 transition-colors"
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
                <Button variant="ghost" size="sm" onClick={onClose} className="rounded-lg">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  className="rounded-lg px-5"
                >
                  {isEdit ? 'Save changes' : 'Create task'}
                </Button>
              </div>

      </div>
    </MobileBottomSheet>
  );
};
