'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTaskBoardStore } from '@/store/useTaskBoardStore';
import { useFocusStore } from '@/store/useFocusStore';
import { useStreakStore } from '@/store/useStreakStore';
import { Skeleton as SkeletonPrimitive } from '@/components/ui/skeleton';
import { Skeleton } from 'boneyard-js/react';
import { isToday } from 'date-fns';

// ── Icons ───────────────────────────────────────────────────────────────────

const CheckIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const CalendarIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const ClockIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

const FlameIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatFocusMinutes(minutes: number): string {
  if (minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// ── Widget ──────────────────────────────────────────────────────────────────

export const TodaySummaryWidget: React.FC = () => {
  const tasks = useTaskBoardStore(s => s.tasks);
  const tasksHydrated = useTaskBoardStore(s => s.dbHydrated);
  const focusSessions = useFocusStore(s => s.sessionHistory);
  const focusHydrated = useFocusStore(s => s.dbHydrated);
  const dailyStreak = useStreakStore(s => s.dailyStreak);

  const stats = useMemo(() => {
    const todayTasks = tasks.filter(t => !t.parentTaskId);
    const dueToday = todayTasks.filter(t => t.dueDate && isToday(new Date(t.dueDate)) && t.status !== 'done').length;
    const completedToday = todayTasks.filter(t => t.status === 'done' && isToday(new Date(t.updatedAt))).length;
    const focusTodayMinutes = focusSessions
      .filter(s => isToday(new Date(s.startTime)))
      .reduce((sum, s) => sum + Math.floor(s.duration / 60), 0);
    return { dueToday, completedToday, focusTodayMinutes };
  }, [tasks, focusSessions]);

  const isLoading = !tasksHydrated || !focusHydrated;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-card border border-border rounded-xl p-5"
    >
      <h3 className="text-sm font-semibold text-foreground mb-3">Today</h3>

      <Skeleton
        name="dashboard.TodaySummaryWidget"
        loading={isLoading}
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
              <CalendarIcon />
              <span className="text-[11px]">Due today</span>
            </div>
            <span className="text-2xl font-bold tabular-nums text-foreground">{stats.dueToday}</span>
          </div>
          <div className="p-3 flex flex-col items-start gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CheckIcon />
              <span className="text-[11px]">Completed</span>
            </div>
            <span className="text-2xl font-bold tabular-nums text-foreground">{stats.completedToday}</span>
          </div>
          <div className="p-3 flex flex-col items-start gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <ClockIcon />
              <span className="text-[11px]">Focus time</span>
            </div>
            <span className="text-2xl font-bold tabular-nums text-foreground">{formatFocusMinutes(stats.focusTodayMinutes)}</span>
          </div>
          <div className="p-3 flex flex-col items-start gap-1">
            <div className="flex items-center gap-1.5 text-amber-500">
              <FlameIcon />
              <span className="text-[11px]">Day streak</span>
            </div>
            <span className="text-2xl font-bold tabular-nums text-foreground">{dailyStreak}</span>
          </div>
        </div>
      </Skeleton>
    </motion.div>
  );
};
