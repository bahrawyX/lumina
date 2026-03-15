'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Task, TaskStatus } from '../../types/task';
import { COLUMNS } from '../../types/task';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { Input } from '../ui/input';
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
}

interface TaskDialogProps {
  open: boolean;
  task?: Task | null;             // null/undefined = create mode
  defaultStatus?: TaskStatus;
  onSave: (payload: TaskDialogPayload) => void;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const TaskDialog: React.FC<TaskDialogProps> = ({
  open, task, defaultStatus = 'todo', onSave, onClose,
}) => {
  const isEdit = Boolean(task);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [dueDate, setDueDate] = useState('');
  const [titleError, setTitleError] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Sync form when task changes or dialog opens
  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? '');
      setDescription(task?.description ?? '');
      setStatus(task?.status ?? defaultStatus);
      setDurationMinutes(task?.durationMinutes ?? 30);
      setDueDate(normalizeDueDateString(task?.dueDate) ?? '');
      setTitleError(false);
      setDatePickerOpen(false);
    }
  }, [open, task, defaultStatus]);

  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError(true);
      return;
    }
    onSave({
      title: trimmed,
      description: description.trim() || undefined,
      status,
      durationMinutes,
      dueDate: normalizeDueDateString(dueDate),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave();
    if (e.key === 'Escape') onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Dialog panel */}
          <motion.div
            key="dialog"
            role="dialog"
            aria-modal="true"
            aria-label={isEdit ? 'Edit task' : 'Create task'}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            onKeyDown={handleKeyDown}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4"
          >
            <div
              className="pointer-events-auto w-full max-w-md bg-card border border-border/70 rounded-2xl shadow-2xl p-6 flex flex-col gap-5"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-foreground tracking-[-0.01em]">
                  {isEdit ? 'Edit Task' : 'New Task'}
                </h2>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
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
                  <Input
                    id="task-title"
                    autoFocus
                    placeholder="What needs to be done?"
                    value={title}
                    onChange={e => { setTitle(e.target.value); if (titleError) setTitleError(false); }}
                    className={`h-9 text-sm rounded-xl ${titleError ? 'border-destructive ring-destructive/30' : ''}`}
                  />
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
