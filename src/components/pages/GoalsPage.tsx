'use client';

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGoalsStore, selectActiveGoals } from '@/store/useGoalsStore';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Goal, GoalStatus, GoalTimeframe, GoalColor } from '@/types/goal';
import { computeGoalProgress, computeTargetProgress, GOAL_COLOR_MAP, TIMEFRAME_LABELS } from '@/types/goal';
import { GoalDetailSheet } from '@/components/goals/GoalDetailSheet';
import { GoalDialog } from '@/components/goals/GoalDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, differenceInDays, isPast } from 'date-fns';
import { LottieOverlay } from '@/components/ui/LottieOverlay';
import { showCoinToast } from '@/lib/coins/showCoinToast';

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
}> = React.memo(({ goal, onSelect, onEdit, onComplete, onArchive, onDelete }) => {
  const progress = computeGoalProgress(goal);
  const colors = GOAL_COLOR_MAP[goal.color as GoalColor] ?? GOAL_COLOR_MAP.blue;
  const endDate = new Date(goal.endDate);
  const startDate = new Date(goal.startDate);
  const daysLeft = differenceInDays(endDate, new Date());
  const isOverdue = isPast(endDate) && goal.status === 'active';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className={`group relative rounded-xl border bg-card p-4 cursor-pointer hover:shadow-md transition-shadow border-l-[3px] ${colors.border} focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`}
      onClick={() => onSelect(goal)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(goal); } }}
      tabIndex={0}
      role="button"
      aria-label={`Goal: ${goal.title}, ${computeGoalProgress(goal)}% complete`}
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

      {/* Progress */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Goal progress: ${progress}%`}>
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          />
        </div>
        <span className="text-sm font-bold tabular-nums text-foreground">{progress}%</span>
      </div>

      {/* Compact targets */}
      {goal.targets.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {goal.targets.slice(0, 3).map(target => {
            const tp = computeTargetProgress(target);
            return (
              <div key={target.id} className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground truncate flex-1 min-w-0">{target.title}</span>
                <div className="w-16 h-1 rounded-full bg-muted overflow-hidden flex-shrink-0">
                  <div className="h-full rounded-full bg-primary/60" style={{ width: `${tp}%` }} />
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground flex-shrink-0 w-10 text-right">
                  {target.type === 'boolean' ? (target.currentValue >= 1 ? 'Done' : '—') :
                   target.type === 'percentage' ? `${Math.round(target.currentValue)}%` :
                   `${Math.round(target.currentValue)}/${Math.round(target.targetValue)}`}
                </span>
              </div>
            );
          })}
          {goal.targets.length > 3 && (
            <span className="text-[10px] text-muted-foreground/60">+{goal.targets.length - 3} more</span>
          )}
        </div>
      )}

      {/* Footer */}
      <p className={`text-[11px] font-medium ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
        {isOverdue ? 'Overdue' : daysLeft === 0 ? 'Ends today' : daysLeft === 1 ? '1 day left' : `${daysLeft} days left`}
      </p>
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
  const goals = useGoalsStore(s => s.goals);
  const dbHydrated = useGoalsStore(s => s.dbHydrated);
  const updateGoal = useGoalsStore(s => s.updateGoal);
  const archiveGoal = useGoalsStore(s => s.archiveGoal);
  const deleteGoal = useGoalsStore(s => s.deleteGoal);

  const [statusFilter, setStatusFilter] = useState<GoalStatus | 'all'>('active');
  const [timeframeFilter, setTimeframeFilter] = useState<GoalTimeframe | 'all'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [showGoalTrophy, setShowGoalTrophy] = useState(false);

  const filtered = useMemo(() => {
    return goals
      .filter(g => statusFilter === 'all' || g.status === statusFilter)
      .filter(g => timeframeFilter === 'all' || g.timeframe === timeframeFilter)
      .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
  }, [goals, statusFilter, timeframeFilter]);

  const handleEdit = (goal: Goal) => { setEditingGoal(goal); setDialogOpen(true); };
  const handleComplete = (goal: Goal) => {
    updateGoal(goal.id, { status: 'completed' });
    setShowGoalTrophy(true);
    showCoinToast(100, 'Goal completed!');
  };
  const handleArchive = (goal: Goal) => archiveGoal(goal.id);
  const handleDelete = (goal: Goal) => deleteGoal(goal.id);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Goal completion celebration */}
      <LottieOverlay
        show={showGoalTrophy}
        path="/animations/goal-trophy.json"
        duration={2000}
        size={200}
        onDone={() => setShowGoalTrophy(false)}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 md:mb-6 flex-shrink-0">
        <div>
          <h1 className="font-display text-lg md:text-xl font-semibold text-foreground tracking-[-0.02em]">
            Goals
          </h1>
          <p className="text-[11px] md:text-xs text-muted-foreground mt-0.5 hidden sm:block">
            {goals.filter(g => g.status === 'active').length} active goals
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => { setEditingGoal(null); setDialogOpen(true); }}
          className="gap-1.5 rounded-xl h-9 md:h-8 text-xs"
        >
          <PlusIcon />
          New Goal
        </Button>
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

      {/* Grid */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {!dbHydrated ? (
          /* Skeleton loading */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-1.5 w-full rounded-full" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="text-4xl">🎯</div>
            <p className="text-sm text-muted-foreground">
              {statusFilter === 'active' ? 'No active goals yet' : 'No goals found'}
            </p>
            {statusFilter === 'active' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setEditingGoal(null); setDialogOpen(true); }}
                className="text-primary"
              >
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
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <GoalDialog
        open={dialogOpen}
        goal={editingGoal}
        onClose={() => { setDialogOpen(false); setEditingGoal(null); }}
      />

      <GoalDetailSheet
        goal={selectedGoal}
        open={!!selectedGoal}
        onClose={() => setSelectedGoal(null)}
        onEdit={handleEdit}
      />
    </div>
  );
}
