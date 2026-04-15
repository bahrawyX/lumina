'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useGoalsStore } from '@/store/useGoalsStore';
import { computeGoalProgress, GOAL_COLOR_MAP } from '@/types/goal';
import type { GoalColor } from '@/types/goal';
import { differenceInDays, isPast } from 'date-fns';
import { Skeleton as SkeletonPrimitive } from '@/components/ui/skeleton';
import { Skeleton } from 'boneyard-js/react';

export const GoalsWidget: React.FC = () => {
  const router = useRouter();
  const allGoals = useGoalsStore(s => s.goals);
  const dbHydrated = useGoalsStore(s => s.dbHydrated);

  // Memoize — selectors that create new arrays cause getSnapshot infinite loops
  const topThree = useMemo(
    () => allGoals
      .filter(g => g.status === 'active')
      .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
      .slice(0, 3),
    [allGoals]
  );

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
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <SkeletonPrimitive className="h-3.5 w-32 rounded" />
                  <SkeletonPrimitive className="h-3 w-10 rounded" />
                </div>
                <SkeletonPrimitive className="h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        }
      >
      {topThree.length === 0 ? (
        <div className="flex flex-col items-center py-4 gap-1.5">
          <p className="text-xs text-muted-foreground">No active goals</p>
          <Link href="/goals" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
            Create one
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {topThree.map((goal, i) => {
            const progress = computeGoalProgress(goal);
            const colors = GOAL_COLOR_MAP[goal.color as GoalColor] ?? GOAL_COLOR_MAP.blue;
            const end = new Date(goal.endDate);
            const daysLeft = differenceInDays(end, new Date());
            const overdue = isPast(end);
            const daysLabel = overdue ? 'Overdue' : daysLeft === 0 ? 'Due today' : `${daysLeft} days`;
            const daysClass = overdue ? 'text-destructive' : daysLeft === 0 ? 'text-amber-500' : 'text-muted-foreground';

            return (
              <button
                key={goal.id}
                type="button"
                onClick={() => router.push('/goals')}
                className="w-full text-left py-2.5 first:pt-0 last:pb-0 hover:bg-muted/30 -mx-1 px-1 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Goal ${goal.title}, ${progress}% complete`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {goal.emoji && <span className="text-sm flex-shrink-0">{goal.emoji}</span>}
                    <span className="text-sm font-medium text-foreground truncate">{goal.title}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-muted-foreground tabular-nums">{progress}%</span>
                    <span className={`text-[10px] ${daysClass}`}>{daysLabel}</span>
                  </div>
                </div>
                <div
                  className="h-1.5 rounded-full bg-muted overflow-hidden"
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <motion.div
                    className={`h-full rounded-full ${colors.bg.replace('/10', '')} bg-primary`}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.6, delay: i * 0.08, ease: [0.4, 0, 0.2, 1] }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
      </Skeleton>
    </motion.div>
  );
};
