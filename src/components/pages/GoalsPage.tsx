'use client';

import React, { useMemo, useState, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGoalsStore, selectActiveGoals, resolveGoalDbId } from '@/store/useGoalsStore';
import { Button } from '@/components/ui/button';
import { Skeleton as SkeletonPrimitive } from '@/components/ui/skeleton';
import type { Goal, GoalStatus, GoalTimeframe, GoalColor } from '@/types/goal';
import { computeGoalProgress, formatFocusMinutes, getProgressBadge, GOAL_COLOR_MAP, TIMEFRAME_LABELS } from '@/types/goal';
import { useRouter } from 'next/navigation';
import confetti from 'canvas-confetti';
// Dialog + sheet are only mounted after user interaction — lazy-load keeps
// them out of the initial /goals bundle.
const GoalDetailSheet = lazy(() =>
  import('@/components/goals/GoalDetailSheet').then(m => ({ default: m.GoalDetailSheet })),
);
const GoalDialog = lazy(() =>
  import('@/components/goals/GoalDialog').then(m => ({ default: m.GoalDialog })),
);
const GoalSuggestionCard = lazy(() =>
  import('@/components/goals/GoalSuggestionCard').then(m => ({ default: m.GoalSuggestionCard })),
);
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, differenceInDays, isPast } from 'date-fns';
import { CoinsBadge } from '@/components/coins/CoinsBadge';
import { cn } from '@/lib/utils';
import { LazyDialogFallback } from '@/components/ui/LazyDialogFallback';

// ── Icons ───────────────────────────────────────────────────────────────────

const PlusIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const MoreIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
  </svg>
);

// ── Goal Card ───────────────────────────────────────────────────────────────

const GoalCard: React.FC<{
  goal: Goal;
  onSelect: (goal: Goal) => void;
  onEdit: (goal: Goal) => void;
  onComplete: (goal: Goal) => void;
  onArchive: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onViewTasks: (goal: Goal) => void;
}> = React.memo(({ goal, onSelect, onEdit, onComplete, onArchive, onDelete, onViewTasks }) => {
  const progress = computeGoalProgress(goal);
  const colors = GOAL_COLOR_MAP[goal.color as GoalColor] ?? GOAL_COLOR_MAP.blue;
  const endDate = new Date(goal.endDate);
  const startDate = new Date(goal.startDate);
  const daysLeft = differenceInDays(endDate, new Date());
  const isOverdue = isPast(endDate) && goal.status === 'active';

  const addTarget = useGoalsStore(s => s.addTarget);
  const updateTargetProgress = useGoalsStore(s => s.updateTargetProgress);

  // Auto-created progress target detection
  const manualTarget = goal.targets.length === 1 && goal.targets[0].type === 'percentage' && goal.targets[0].title === 'Progress'
    ? goal.targets[0]
    : null;
  const canEditProgress = goal.targets.length === 0 || manualTarget !== null;

  // Overall progress slider (no-target / manual-progress goals)
  const [editingProgress, setEditingProgress] = useState(false);
  const [progressDraft, setProgressDraft] = useState(0);
  const draftRef = useRef(progressDraft);
  draftRef.current = progressDraft;

  // Per-target inline editing (percentage + number types)
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [targetDraft, setTargetDraft] = useState(0);

  const handleProgressClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEditProgress) return;
    setProgressDraft(progress);
    setEditingProgress(true);
  };

  const commitProgress = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProgress(false);
    const value = draftRef.current;
    if (manualTarget) {
      updateTargetProgress(goal.id, manualTarget.id, value);
    } else {
      const target = addTarget(goal.id, { title: 'Progress', type: 'percentage', targetValue: 100 });
      if (target) updateTargetProgress(goal.id, target.id, value);
    }
  };

  const cancelProgress = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProgress(false);
  };

  // Targets that are displayed (hide the auto "Progress" one since it's covered by the bar)
  const visibleTargets = goal.targets.filter(t => !(t.title === 'Progress' && t.type === 'percentage'));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className={`card-lift group relative rounded-xl border-2 ${colors.border} bg-card p-4 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none`}
      onClick={() => !editingProgress && !editingTargetId && onSelect(goal)}
      onKeyDown={(e) => { if (!editingProgress && !editingTargetId && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(goal); } }}
      tabIndex={0}
      role="button"
      aria-label={`Goal: ${goal.title}, ${progress}% complete`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {goal.emoji && <span className="text-lg flex-shrink-0">{goal.emoji}</span>}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{goal.title}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${colors.bg} ${colors.text}`}>
                {TIMEFRAME_LABELS[goal.timeframe]}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {format(startDate, 'MMM d')} – {format(endDate, 'MMM d, yyyy')}
              </span>
            </div>
          </div>
        </div>

        {/* Actions menu */}
        <div onClick={e => e.stopPropagation()} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center">
                <MoreIcon />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={() => onEdit(goal)}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onComplete(goal)}>Complete</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onArchive(goal)}>Archive</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(goal)} className="text-destructive focus:text-destructive">
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Overall progress bar */}
      {editingProgress ? (
        <div className="mb-3" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2.5 mb-2">
            <input
              type="range"
              min={0}
              max={100}
              value={progressDraft}
              onChange={e => setProgressDraft(Number(e.target.value))}
              className="flex-1 h-1.5 accent-primary cursor-pointer"
            />
            <span className="text-sm font-bold tabular-nums text-foreground w-10 text-right">{progressDraft}%</span>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={cancelProgress} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            <button type="button" onClick={commitProgress} className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors">Save</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Goal progress: ${progress}%`}>
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            />
          </div>
          <button
            type="button"
            onClick={handleProgressClick}
            disabled={!canEditProgress}
            title={canEditProgress ? 'Click to set progress' : undefined}
            className={`text-sm font-bold tabular-nums text-foreground transition-colors ${canEditProgress ? 'hover:text-primary cursor-pointer' : 'cursor-default'}`}
          >
            {progress}%
          </button>
        </div>
      )}

      {/* Interactive targets — each row is a clickable mini-tracker.
          Title on the left, progress bar in the middle, action on the right. */}
      {visibleTargets.length > 0 && (
        <div className="space-y-2 mb-3 pt-2 border-t border-border/40" onClick={e => e.stopPropagation()}>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 font-semibold mb-1">Sub-goals · click to update</p>
          {visibleTargets.slice(0, 3).map(target => {
            const isEditingThis = editingTargetId === target.id;
            const pct = target.targetValue > 0
              ? Math.min(100, Math.round((target.currentValue / target.targetValue) * 100))
              : 0;
            const isDone = target.type === 'boolean' ? target.currentValue >= 1 : pct >= 100;

            return (
              <div
                key={target.id}
                className={cn(
                  'rounded-lg px-2 py-1.5 transition-colors',
                  isDone ? 'bg-emerald-500/[0.07]' : 'bg-muted/30 hover:bg-muted/50',
                )}
              >
                <div className="flex items-center gap-2 min-h-[26px]">
                  {/* Title + tiny progress bar */}
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-[12px] font-medium truncate', isDone ? 'text-emerald-400' : 'text-foreground')}>{target.title}</p>
                    {target.type !== 'boolean' && (
                      <div className="h-1 mt-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all duration-300', isDone ? 'bg-emerald-400' : 'bg-primary')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Boolean — tap to toggle */}
                  {target.type === 'boolean' && (
                    <button
                      type="button"
                      onClick={() => updateTargetProgress(goal.id, target.id, target.currentValue >= 1 ? 0 : 1)}
                      className={cn(
                        'text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors flex-shrink-0 min-w-[88px]',
                        isDone
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15',
                      )}
                    >
                      {isDone ? '✓ Done' : 'Mark done'}
                    </button>
                  )}

                  {/* Number — − / value / + */}
                  {target.type === 'number' && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => updateTargetProgress(goal.id, target.id, Math.max(0, target.currentValue - 1))}
                        className="w-7 h-7 rounded-md border border-border text-base font-medium flex items-center justify-center hover:bg-muted hover:border-primary/40 text-foreground transition-colors leading-none"
                        aria-label="Decrement"
                      >−</button>
                      <button
                        type="button"
                        onClick={() => { setEditingTargetId(target.id); setTargetDraft(target.currentValue); }}
                        className="text-[11px] font-semibold tabular-nums text-foreground hover:text-primary transition-colors min-w-[48px] text-center"
                        title="Click to set exact value"
                      >
                        {Math.round(target.currentValue)}<span className="text-muted-foreground">/{Math.round(target.targetValue)}</span>
                        {target.unit ? <span className="text-muted-foreground/70 ml-0.5">{target.unit}</span> : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateTargetProgress(goal.id, target.id, Math.min(target.targetValue, target.currentValue + 1))}
                        className="w-7 h-7 rounded-md border border-primary/30 bg-primary/10 text-base font-medium flex items-center justify-center hover:bg-primary/15 text-primary transition-colors leading-none"
                        aria-label="Increment"
                      >+</button>
                    </div>
                  )}

                  {/* Percentage — click pill to open slider */}
                  {target.type === 'percentage' && (
                    <button
                      type="button"
                      onClick={() => { setEditingTargetId(target.id); setTargetDraft(target.currentValue); }}
                      className="text-[11px] font-semibold tabular-nums px-2.5 py-1 rounded-md border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 transition-colors flex-shrink-0"
                      title="Click to set progress"
                    >
                      {Math.round(target.currentValue)}%
                    </button>
                  )}

                  {/* Task completion — read-only */}
                  {target.type === 'task_completion' && (
                    <span className="text-[11px] tabular-nums text-muted-foreground flex-shrink-0 px-2 py-0.5 rounded-md bg-muted/50">
                      {Math.round(target.currentValue)}/{Math.round(target.targetValue)} tasks
                    </span>
                  )}
                </div>

                {/* Inline mini-editor for number / percentage */}
                {isEditingThis && (target.type === 'percentage' || target.type === 'number') && (
                  <div className="flex items-center gap-2 mt-1.5 pl-0">
                    <input
                      type="range"
                      min={0}
                      max={target.type === 'percentage' ? 100 : target.targetValue}
                      step={target.type === 'percentage' ? 1 : Math.max(1, Math.ceil(target.targetValue / 100))}
                      value={targetDraft}
                      onChange={e => setTargetDraft(Number(e.target.value))}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 h-1 accent-primary cursor-pointer"
                      autoFocus
                    />
                    <span className="text-[10px] tabular-nums text-foreground w-10 text-right flex-shrink-0">
                      {target.type === 'percentage'
                        ? `${Math.round(targetDraft)}%`
                        : `${Math.round(targetDraft)}${target.unit ? ` ${target.unit}` : ''}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => { updateTargetProgress(goal.id, target.id, targetDraft); setEditingTargetId(null); }}
                      className="text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors flex-shrink-0"
                    >Save</button>
                    <button
                      type="button"
                      onClick={() => setEditingTargetId(null)}
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                    >✕</button>
                  </div>
                )}
              </div>
            );
          })}
          {visibleTargets.length > 3 && (
            <span className="text-[10px] text-muted-foreground/60">+{visibleTargets.length - 3} more</span>
          )}
        </div>
      )}

      {/* Goal-Driven Work summary — shown only when the goal has linked tasks */}
      {(goal.taskCount ?? 0) > 0 && (
        <div className="flex items-center justify-between gap-2 mt-1 mb-2 pt-2 border-t border-border/30">
          <p className="text-[11px] text-muted-foreground tabular-nums">
            <span className="text-foreground font-medium">{goal.completedTaskCount ?? 0}</span>
            <span className="text-muted-foreground/70"> of </span>
            <span className="text-foreground font-medium">{goal.taskCount}</span>
            <span> tasks complete</span>
            {formatFocusMinutes(goal.focusMinutes) && (
              <>
                <span className="text-muted-foreground/40 mx-1.5">·</span>
                <span className="text-foreground font-medium">{formatFocusMinutes(goal.focusMinutes)}</span>
                <span> focused</span>
              </>
            )}
          </p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onViewTasks(goal); }}
            className="text-[11px] font-medium text-primary hover:text-primary/80 transition-colors flex-shrink-0 whitespace-nowrap"
          >
            View tasks ↗
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        <p className={`text-[11px] font-medium ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
          {isOverdue ? 'Overdue' : daysLeft === 0 ? 'Ends today' : daysLeft === 1 ? '1 day left' : `${daysLeft} days left`}
        </p>
        {(() => {
          const badge = getProgressBadge(progress);
          if (!badge) return null;
          if (badge === 'complete') {
            return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500">Complete 🎉</span>;
          }
          if (badge === 'almost') {
            return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500">Almost there!</span>;
          }
          return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">In progress</span>;
        })()}
      </div>
    </motion.div>
  );
});
GoalCard.displayName = 'GoalCard';

// ── Main GoalsPage ──────────────────────────────────────────────────────────

const STATUS_TABS: { value: GoalStatus | 'all'; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

const TIMEFRAME_TABS: { value: GoalTimeframe | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

export default function GoalsPage() {
  const router = useRouter();
  const goals = useGoalsStore(s => s.goals);
  const dbHydrated = useGoalsStore(s => s.dbHydrated);
  const updateGoal = useGoalsStore(s => s.updateGoal);
  const updateTargetProgress = useGoalsStore(s => s.updateTargetProgress);
  const archiveGoal = useGoalsStore(s => s.archiveGoal);
  const deleteGoal = useGoalsStore(s => s.deleteGoal);

  const [statusFilter, setStatusFilter] = useState<GoalStatus | 'all'>('active');
  const [timeframeFilter, setTimeframeFilter] = useState<GoalTimeframe | 'all'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  // Goal IDs we've offered AI suggestions for in this session. The dialog
  // hands us the optimistic id (`goal_xxx`); we resolve it to the real
  // server UUID before the suggestion card mounts so /api/goals/[id]/...
  // hits an existing row.
  const [pendingSuggestionFor, setPendingSuggestionFor] = useState<string | null>(null);
  const [resolvedSuggestionGoalId, setResolvedSuggestionGoalId] = useState<string | null>(null);

  React.useEffect(() => {
    if (!pendingSuggestionFor) {
      setResolvedSuggestionGoalId(null);
      return;
    }
    let cancelled = false;
    void resolveGoalDbId(pendingSuggestionFor).then((real) => {
      if (cancelled) return;
      setResolvedSuggestionGoalId(real);
    });
    return () => { cancelled = true; };
  }, [pendingSuggestionFor]);

  const suggestionGoal = resolvedSuggestionGoalId
    ? goals.find((g) => g.id === resolvedSuggestionGoalId) ?? null
    : null;

  // Goal-completion confetti — fires once per goal when its server-computed
  // progress crosses to 100%. We track which goals already celebrated so a
  // re-render or re-fetch doesn't re-fire confetti.
  const celebratedRef = useRef<Set<string>>(new Set());
  React.useEffect(() => {
    for (const g of goals) {
      if (g.status !== 'active') continue;
      if ((g.taskCount ?? 0) === 0) continue;
      if ((g.progress ?? 0) < 100) continue;
      if (celebratedRef.current.has(g.id)) continue;
      celebratedRef.current.add(g.id);
      // Center burst — keep it brief so it doesn't grab attention forever.
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x: 0.5, y: 0.45 },
        ticks: 200,
      });
    }
  }, [goals]);

  const handleViewTasks = (goal: Goal) => {
    router.push(`/tasks?goal=${goal.id}`);
  };

  const filtered = useMemo(() => {
    return goals
      .filter(g => statusFilter === 'all' || g.status === statusFilter)
      .filter(g => timeframeFilter === 'all' || g.timeframe === timeframeFilter)
      .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
  }, [goals, statusFilter, timeframeFilter]);

  const handleEdit = (goal: Goal) => { setEditingGoal(goal); setDialogOpen(true); };
  const handleComplete = (goal: Goal) => {
    // Push every measurable target to its full value before marking complete
    goal.targets.forEach(t => {
      if (t.type !== 'task_completion') {
        updateTargetProgress(goal.id, t.id, t.targetValue);
      }
    });
    updateGoal(goal.id, { status: 'completed' });
    // Coin toast + trophy both fire from `goalsPersistence.updateOne` ONLY after
    // the server confirms the completion and reports coinsEarned > 0 — no more
    // optimistic celebration on a failed save or a re-completed (dedupe) goal.
  };
  const handleArchive = (goal: Goal) => archiveGoal(goal.id);
  const handleDelete = (goal: Goal) => deleteGoal(goal.id);

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header — editorial */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4 md:mb-5 pb-4 md:pb-5 border-b border-border/60 flex-shrink-0">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 mb-1.5">
            Workspace · Objectives
          </p>
          <h1 className="font-display text-2xl md:text-3xl font-medium text-foreground tracking-[-0.035em] leading-none">
            Goals
          </h1>
          <p className="text-[11px] md:text-xs text-muted-foreground/80 mt-2 hidden sm:block tabular-nums">
            {goals.filter(g => g.status === 'active').length} active · {goals.length} total
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <CoinsBadge variant="chip" />
          <Button
            size="sm"
            onClick={() => { setEditingGoal(null); setDialogOpen(true); }}
            className="gap-1.5 rounded-xl h-9 md:h-8 text-xs whitespace-nowrap"
          >
            <PlusIcon />
            New Goal
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4 flex-shrink-0">
        {/* Status pills */}
        <div className="flex items-center rounded-lg border border-border/50 p-0.5">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                statusFilter === tab.value ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Timeframe pills */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {TIMEFRAME_TABS.map(tab => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setTimeframeFilter(tab.value)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                timeframeFilter === tab.value ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* AI task suggestion card — shown above the grid for the goal that
          was just created. Mounts only after the optimistic id resolves to
          a real UUID, otherwise the suggestion endpoint would 404. */}
      {suggestionGoal && (
        <div className="flex-shrink-0 mb-2">
          <Suspense fallback={<LazyDialogFallback label="Loading suggestion" />}>
            <GoalSuggestionCard
              goal={suggestionGoal}
              onDismiss={() => { setPendingSuggestionFor(null); setResolvedSuggestionGoalId(null); }}
            />
          </Suspense>
        </div>
      )}

      {/* Grid */}
      {/*
        We bypass the <Skeleton> wrapper here on purpose. If the
        user has even one goal in memory we render it immediately — the
        skeleton previously gated children on its `loading` prop, and at
        least one prod-only edge case had it leaving the children hidden
        even after dbHydrated flipped true (counter showed "X active · Y
        total" but no card rendered). Defaulting to the data path removes
        that whole class of failure: skeleton bones only show when goals
        is genuinely empty AND we haven't hydrated yet.
      */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {!dbHydrated && goals.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="rounded-xl border border-border/60 bg-card p-4 space-y-3 shadow-card">
                <SkeletonPrimitive className="h-4 w-3/4 rounded" />
                <SkeletonPrimitive className="h-1.5 w-full rounded-full" />
                <SkeletonPrimitive className="h-3 w-1/2 rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          /* Empty state — editorial */
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="text-5xl opacity-80" style={{ animation: 'float 4s ease-in-out infinite' }}>🎯</div>
            <div className="space-y-1.5">
              <p className="font-display text-lg md:text-xl font-medium text-foreground tracking-[-0.02em]">
                {statusFilter === 'active' ? 'A quiet slate.' : 'Nothing to see here.'}
              </p>
              <p className="text-[12px] text-muted-foreground/80 italic max-w-[320px]">
                {statusFilter === 'active' ? 'Set a measurable target and Lumina will chart the journey.' : 'Try a different filter to find what you\'re looking for.'}
              </p>
            </div>
            {statusFilter === 'active' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setEditingGoal(null); setDialogOpen(true); }}
                className="mt-2 gap-1.5 rounded-lg"
              >
                <PlusIcon />
                Create your first goal
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4">
            <AnimatePresence mode="popLayout">
              {filtered.map((goal, i) => (
                <motion.div
                  key={goal.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <GoalCard
                    goal={goal}
                    onSelect={setSelectedGoal}
                    onEdit={handleEdit}
                    onComplete={handleComplete}
                    onArchive={handleArchive}
                    onDelete={handleDelete}
                    onViewTasks={handleViewTasks}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Dialogs — lazy, only mount once opened */}
      <Suspense fallback={<LazyDialogFallback label="Opening goal editor" />}>
        {(dialogOpen || editingGoal) && (
          <GoalDialog
            open={dialogOpen}
            goal={editingGoal}
            onClose={() => { setDialogOpen(false); setEditingGoal(null); }}
            onCreated={(goalId) => setPendingSuggestionFor(goalId)}
          />
        )}
      </Suspense>

      <Suspense fallback={<LazyDialogFallback label="Opening goal details" />}>
        {selectedGoal && (
          <GoalDetailSheet
            goal={selectedGoal}
            open={!!selectedGoal}
            onClose={() => setSelectedGoal(null)}
            onEdit={handleEdit}
          />
        )}
      </Suspense>
    </div>
  );
}
