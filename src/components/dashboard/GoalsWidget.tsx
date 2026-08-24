'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useGoalsStore } from '@/store/useGoalsStore';
import { computeGoalProgress } from '@/types/goal';
import { differenceInDays, isPast } from 'date-fns';
import { Skeleton as SkeletonPrimitive } from '@/components/ui/skeleton';
import { Skeleton } from '@/components/ui/LoadingBoundary';

// ── Icons — 14px outline set matching TodaySummaryWidget ──────────────────────

const TargetIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
  </svg>
);

const TrophyIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" /><path d="M16 6h3v2a3 3 0 0 1-3 3M8 6H5v2a3 3 0 0 0 3 3" /><path d="M7 20h10M10 13h4v3h-4z" />
  </svg>
);

const GaugeIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 14l4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" />
  </svg>
);

const ClockAlertIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

// ── Widget ────────────────────────────────────────────────────────────────────

export const GoalsWidget: React.FC = () => {
  const allGoals    = useGoalsStore(s => s.goals);
  const dbHydrated  = useGoalsStore(s => s.dbHydrated);

  const stats = useMemo(() => {
    const active    = allGoals.filter(g => g.status === 'active');
    const completed = allGoals.filter(g => g.status === 'completed').length;
    const avgProgress = active.length === 0
      ? 0
      : Math.round(active.reduce((sum, g) => sum + computeGoalProgress(g), 0) / active.length);
    const dueSoon = active.filter(g => {
      const days = differenceInDays(new Date(g.endDate), new Date());
      return !isPast(new Date(g.endDate)) && days <= 7;
    }).length;
    return { active: active.length, completed, avgProgress, dueSoon };
  }, [allGoals]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="card-lift bg-card border border-border/70 rounded-xl p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Goals</h3>
        <Link href="/goals" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          View all
        </Link>
      </div>

      <Skeleton
        name="dashboard.GoalsWidget"
        loading={!dbHydrated}
        fallback={
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="space-y-1.5">
                <SkeletonPrimitive className="h-3 w-16 rounded" />
                <SkeletonPrimitive className="h-6 w-12 rounded" />
              </div>
            ))}
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3 divide-x divide-y divide-border -m-1">
          <div className="p-3 flex flex-col items-start gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <TargetIcon />
              <span className="text-[11px]">Active</span>
            </div>
            <span className="text-2xl font-bold tabular-nums text-foreground">{stats.active}</span>
          </div>
          <div className="p-3 flex flex-col items-start gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <GaugeIcon />
              <span className="text-[11px]">Avg progress</span>
            </div>
            <span className="text-2xl font-bold tabular-nums text-foreground">{stats.avgProgress}%</span>
          </div>
          <div className="p-3 flex flex-col items-start gap-1">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <TrophyIcon />
              <span className="text-[11px]">Completed</span>
            </div>
            <span className="text-2xl font-bold tabular-nums text-foreground">{stats.completed}</span>
          </div>
          <div className="p-3 flex flex-col items-start gap-1">
            <div className={`flex items-center gap-1.5 ${stats.dueSoon > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
              <ClockAlertIcon />
              <span className="text-[11px]">Due this week</span>
            </div>
            <span className="text-2xl font-bold tabular-nums text-foreground">{stats.dueSoon}</span>
          </div>
        </div>
      </Skeleton>
    </motion.div>
  );
};
