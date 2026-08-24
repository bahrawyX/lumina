'use client';

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useGoalsStore } from '@/store/useGoalsStore';
import { useTaskBoardStore } from '@/store/useTaskBoardStore';
import type { Goal, GoalTarget, TargetType, GoalColor } from '@/types/goal';
import { computeGoalProgress, computeTargetProgress, GOAL_COLOR_MAP, TIMEFRAME_LABELS } from '@/types/goal';
import { format, differenceInDays, isPast, differenceInCalendarDays } from 'date-fns';

// ── Progress Ring ───────────────────────────────────────────────────────────

const ProgressRing: React.FC<{ progress: number; size: number; strokeWidth: number }> = ({ progress, size, strokeWidth }) => {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - Math.min(1, Math.max(0, progress / 100)));
  const cx = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth} opacity={0.5} />
      <circle
        cx={cx} cy={cx} r={r} fill="none"
        stroke="hsl(var(--primary))" strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={dashOffset}
        style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
      />
    </svg>
  );
};

// ── Inline target controls ──────────────────────────────────────────────────

const NumberStepper: React.FC<{ value: number; max: number; unit?: string; onChange: (v: number) => void }> = ({ value, max, unit, onChange }) => (
  <div className="flex items-center gap-2">
    <button
      type="button" onClick={() => onChange(Math.max(0, value - 1))}
      className="w-7 h-7 rounded-md border border-border text-foreground hover:bg-muted flex items-center justify-center text-sm font-medium transition-colors"
    >-</button>
    <span className="text-sm tabular-nums font-medium text-foreground min-w-[40px] text-center">
      {Math.round(value)}{unit ? ` ${unit}` : ''}
    </span>
    <button
      type="button" onClick={() => onChange(Math.min(max, value + 1))}
      className="w-7 h-7 rounded-md border border-border text-foreground hover:bg-muted flex items-center justify-center text-sm font-medium transition-colors"
    >+</button>
  </div>
);

const BooleanToggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({ value, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!value)}
    className={`w-10 h-5 rounded-full transition-colors relative ${value ? 'bg-primary' : 'bg-muted'}`}
  >
    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-primary-foreground shadow transition-transform ${value ? 'left-[22px]' : 'left-0.5'}`} />
  </button>
);

// ── Add Target Form ─────────────────────────────────────────────────────────

const AddTargetForm: React.FC<{ goalId: string }> = ({ goalId }) => {
  const addTarget = useGoalsStore(s => s.addTarget);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TargetType>('number');
  const [targetValue, setTargetValue] = useState(10);
  const [unit, setUnit] = useState('');
  const [open, setOpen] = useState(false);

  const handleSubmit = () => {
    if (!title.trim()) return;
    addTarget(goalId, {
      title: title.trim(),
      type,
      targetValue: type === 'boolean' ? 1 : targetValue,
      unit: unit.trim() || undefined,
    });
    setTitle('');
    setTargetValue(10);
    setUnit('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-primary hover:text-primary/80 transition-colors font-medium py-1"
      >
        + Add target
      </button>
    );
  }

  return (
    <div className="space-y-2 p-3 rounded-lg border border-border/50 bg-muted/20">
      <input
        autoFocus
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setOpen(false); }}
        placeholder="Target title..."
        className="w-full text-sm bg-transparent border-b border-border focus:border-primary outline-none py-1 text-foreground"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={type}
          onChange={e => setType(e.target.value as TargetType)}
          className="text-xs bg-card border border-border rounded-md px-2 py-1 text-foreground"
        >
          <option value="number">Number</option>
          <option value="percentage">Percentage</option>
          <option value="boolean">Yes/No</option>
          <option value="task_completion">Task Completion</option>
        </select>
        {type !== 'boolean' && type !== 'task_completion' && (
          <>
            <input
              type="number"
              value={targetValue}
              onChange={e => setTargetValue(Number(e.target.value))}
              className="w-16 text-xs bg-card border border-border rounded-md px-2 py-1 text-foreground"
              min={1}
            />
            <input
              type="text"
              value={unit}
              onChange={e => setUnit(e.target.value)}
              placeholder="unit"
              className="w-16 text-xs bg-card border border-border rounded-md px-2 py-1 text-foreground"
            />
          </>
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} className="text-xs h-7 rounded-lg">Add</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="text-xs h-7 rounded-lg">Cancel</Button>
      </div>
    </div>
  );
};

// ── GoalDetailSheet ─────────────────────────────────────────────────────────

export const GoalDetailSheet: React.FC<{
  goal: Goal | null;
  open: boolean;
  onClose: () => void;
  onEdit: (goal: Goal) => void;
}> = ({ goal, open, onClose, onEdit }) => {
  // State — must come before any early return
  const [ringEditing, setRingEditing] = useState(false);
  const [ringDraft, setRingDraft] = useState('');
  const ringInputRef = useRef<HTMLInputElement>(null);

  // Store selectors
  const updateTarget = useGoalsStore(s => s.updateTarget);
  const deleteTarget = useGoalsStore(s => s.deleteTarget);
  const updateTargetProgress = useGoalsStore(s => s.updateTargetProgress);
  const addTarget = useGoalsStore(s => s.addTarget);
  const updateGoal = useGoalsStore(s => s.updateGoal);
  const allTasks = useTaskBoardStore(s => s.tasks);

  // Re-read the goal from store so it stays reactive
  const storeGoals = useGoalsStore(s => s.goals);
  const liveGoal = useMemo(() => storeGoals.find(g => g.id === goal?.id) ?? goal, [storeGoals, goal]);

  if (!liveGoal) return null;

  const progress = computeGoalProgress(liveGoal);
  const colors = GOAL_COLOR_MAP[liveGoal.color as GoalColor] ?? GOAL_COLOR_MAP.blue;
  const endDate = new Date(liveGoal.endDate);
  const startDate = new Date(liveGoal.startDate);
  const daysLeft = differenceInDays(endDate, new Date());
  const totalDays = differenceInCalendarDays(endDate, startDate);
  const elapsedDays = differenceInCalendarDays(new Date(), startDate);
  const timeProgress = totalDays > 0 ? Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100)) : 100;
  const isOverdue = isPast(endDate) && liveGoal.status === 'active';

  // Determine which target (if any) to edit from the ring.
  // Editable when: 0 targets (null → will create), or exactly 1 non-task_completion target.
  // Not editable (undefined) when multiple targets or only task_completion targets.
  const editableRingTarget =
    liveGoal.targets.length === 0
      ? null
      : liveGoal.targets.length === 1 && liveGoal.targets[0].type !== 'task_completion'
        ? liveGoal.targets[0]
        : undefined;
  const ringEditable = editableRingTarget !== undefined;

  const handleRingClick = () => {
    if (!ringEditable) return;
    setRingDraft(String(progress));
    setRingEditing(true);
  };

  const handleRingCommit = () => {
    setRingEditing(false);
    const raw = parseInt(ringDraft, 10);
    if (isNaN(raw)) return;
    const pct = Math.max(0, Math.min(100, raw));

    if (editableRingTarget === null) {
      // No targets yet — create a percentage "Progress" target, then set it
      const t = addTarget(liveGoal.id, { title: 'Progress', type: 'percentage', targetValue: 100 });
      if (t) updateTargetProgress(liveGoal.id, t.id, pct);
    } else {
      // Map entered percentage back to the target's currentValue domain
      let newValue: number;
      switch (editableRingTarget.type) {
        case 'percentage':
          newValue = pct;
          break;
        case 'number':
          newValue = parseFloat(((pct / 100) * editableRingTarget.targetValue).toFixed(4));
          break;
        case 'boolean':
          newValue = pct >= 50 ? 1 : 0;
          break;
        default:
          return;
      }
      updateTargetProgress(liveGoal.id, editableRingTarget.id, newValue);
    }
  };

  const handleMarkComplete = () => {
    // Push every measurable target to its full value (= 100% progress)
    liveGoal.targets.forEach(t => {
      if (t.type !== 'task_completion') {
        updateTargetProgress(liveGoal.id, t.id, t.targetValue);
      }
    });
    updateGoal(liveGoal.id, { status: 'completed' });
    // Coin toast fires from `goalsPersistence.updateOne` after server confirmation.
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full p-0 sm:w-[480px] sm:max-w-[480px] flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {liveGoal.emoji && <span className="text-2xl">{liveGoal.emoji}</span>}
              <SheetTitle className="font-display text-lg">{liveGoal.title}</SheetTitle>
              {/* P2-16: the one remaining Radix surface without a description.
                  The a11y pass covered Dialogs but not Sheets, so Radix logged
                  its missing-description warning and screen readers announced
                  the sheet with a title and nothing else. */}
              <SheetDescription className="sr-only">
                Goal details, targets and progress. Press Escape to close.
              </SheetDescription>
            </div>
            <div className="flex items-center gap-1">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                liveGoal.status === 'active' ? 'border-primary/30 bg-primary/10 text-primary' :
                liveGoal.status === 'completed' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                'border-border bg-muted text-muted-foreground'
              }`}>
                {liveGoal.status.charAt(0).toUpperCase() + liveGoal.status.slice(1)}
              </span>
              {liveGoal.status === 'active' && (
                <button
                  type="button"
                  onClick={handleMarkComplete}
                  className="h-7 px-2 rounded-md text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                >
                  ✓ Complete
                </button>
              )}
              <button
                type="button"
                onClick={() => { onClose(); setTimeout(() => onEdit(liveGoal), 150); }}
                className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center transition-colors"
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
                </svg>
              </button>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Progress ring */}
          <div className="flex flex-col items-center gap-1">
            <div className="relative">
              <ProgressRing progress={progress} size={120} strokeWidth={8} />
              <div className="absolute inset-0 flex items-center justify-center">
                {ringEditing ? (
                  <div className="flex items-center gap-0.5">
                    <input
                      ref={ringInputRef}
                      autoFocus
                      type="number"
                      min={0}
                      max={100}
                      value={ringDraft}
                      onChange={e => setRingDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); handleRingCommit(); }
                        if (e.key === 'Escape') { e.preventDefault(); setRingEditing(false); }
                      }}
                      onBlur={handleRingCommit}
                      className="w-12 text-center text-xl font-bold tabular-nums bg-transparent border-b-2 border-primary outline-none text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      aria-label="Edit goal progress percentage"
                    />
                    <span className="text-base font-bold text-foreground">%</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleRingClick}
                    disabled={!ringEditable}
                    title={ringEditable ? 'Click to edit progress' : 'Progress reflects multiple targets — edit each below'}
                    className={`text-2xl font-bold tabular-nums text-foreground leading-none transition-colors ${ringEditable ? 'hover:text-primary cursor-pointer' : 'cursor-default'}`}
                  >
                    {progress}%
                  </button>
                )}
              </div>
            </div>
            {ringEditable && !ringEditing && (
              <p className="text-[10px] text-muted-foreground/60">click to edit</p>
            )}
          </div>

          {/* Timeframe */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{format(startDate, 'MMM d, yyyy')}</span>
              <span>{format(endDate, 'MMM d, yyyy')}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-muted-foreground/30" style={{ width: `${timeProgress}%` }} />
            </div>
            <p className={`text-xs font-medium text-center ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
              {isOverdue ? 'Overdue' : daysLeft === 0 ? 'Ends today' : `${daysLeft} days remaining`}
            </p>
          </div>

          {/* Targets */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Targets</h3>
            {liveGoal.targets.length === 0 && (
              <p className="text-xs text-muted-foreground/60 py-3 text-center">Add a target to start tracking progress</p>
            )}
            {liveGoal.targets.map(target => {
              const tp = computeTargetProgress(target);
              return (
                <div key={target.id} className="p-3 rounded-lg border border-border/50 bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{target.title}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {target.type.replace('_', ' ')}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteTarget(liveGoal.id, target.id)}
                        className="h-5 w-5 rounded text-muted-foreground/50 hover:text-destructive transition-colors flex items-center justify-center"
                      >
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${tp}%` }} />
                  </div>

                  {/* Controls by type */}
                  <div className="flex items-center justify-between">
                    {target.type === 'number' && (
                      <NumberStepper
                        value={target.currentValue}
                        max={target.targetValue}
                        unit={target.unit}
                        onChange={(v) => updateTargetProgress(liveGoal.id, target.id, v)}
                      />
                    )}
                    {target.type === 'percentage' && (
                      <NumberStepper
                        value={target.currentValue}
                        max={100}
                        unit="%"
                        onChange={(v) => updateTargetProgress(liveGoal.id, target.id, v)}
                      />
                    )}
                    {target.type === 'boolean' && (
                      <BooleanToggle
                        value={target.currentValue >= 1}
                        onChange={(v) => updateTargetProgress(liveGoal.id, target.id, v ? 1 : 0)}
                      />
                    )}
                    {target.type === 'task_completion' && (
                      <div className="text-xs text-muted-foreground">
                        {Math.round(target.currentValue)}/{target.linkedTaskIds.length} tasks done
                      </div>
                    )}
                    <span className="text-xs tabular-nums font-medium text-muted-foreground">
                      {Math.round(tp)}%
                    </span>
                  </div>

                  {/* Linked tasks for task_completion type */}
                  {target.type === 'task_completion' && target.linkedTaskIds.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-border/50">
                      {target.linkedTaskIds.map(taskId => {
                        const task = allTasks.find(t => t.id === taskId);
                        if (!task) return null;
                        return (
                          <div key={taskId} className="flex items-center gap-2 text-xs">
                            <span className={`w-3 h-3 rounded border flex items-center justify-center flex-shrink-0 ${
                              task.status === 'done' ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
                            }`}>
                              {task.status === 'done' && (
                                <svg width={8} height={8} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M20 6 9 17l-5-5" />
                                </svg>
                              )}
                            </span>
                            <span className={`truncate ${task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                              {task.title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <AddTargetForm goalId={liveGoal.id} />
          </div>

          {/* Description */}
          {liveGoal.description && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</h3>
              <p className="text-sm text-foreground/80 leading-relaxed">{liveGoal.description}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
