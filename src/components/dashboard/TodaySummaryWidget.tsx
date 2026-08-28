'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { format, isToday } from 'date-fns';
import { useTaskBoardStore } from '@/store/useTaskBoardStore';
import { useFocusStore } from '@/store/useFocusStore';
import { useStreakStore } from '@/store/useStreakStore';
import { useDailyBriefStore } from '@/store/useDailyBriefStore';
import { useCalendarStore } from '@/store/useCalendarStore';
import { Skeleton as SkeletonPrimitive } from '@/components/ui/skeleton';
import { Skeleton } from '@/components/ui/LoadingBoundary';

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

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── Widget ──────────────────────────────────────────────────────────────────

export const TodaySummaryWidget: React.FC = () => {
  const tasks = useTaskBoardStore(s => s.tasks);
  const tasksHydrated = useTaskBoardStore(s => s.dbHydrated);
  const focusSessions = useFocusStore(s => s.sessionHistory);
  const focusHydrated = useFocusStore(s => s.dbHydrated);
  const dailyStreak = useStreakStore(s => s.dailyStreak);

  // Daily brief — consolidated into this widget so the top-of-page banner
  // can be removed. We only consume eventCount + bestFocusWindow here;
  // the rest (overdue count, streak-at-risk flag) is surfaced via tasks +
  // the Day streak stat cell, not via a separate card.
  const brief      = useDailyBriefStore(s => s.brief);
  const fetchBrief = useDailyBriefStore(s => s.fetchBrief);
  const timezone   = useCalendarStore(s => s.timezone);

  // Hydration guard — time-based greeting must not render server-side.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Fetch brief once per day
  useEffect(() => {
    const lastFetched = useDailyBriefStore.getState().lastFetched;
    const today = format(new Date(), 'yyyy-MM-dd');
    const needsFetch = !lastFetched || !lastFetched.startsWith(today);
    if (needsFetch && !useDailyBriefStore.getState().isLoading) {
      fetchBrief();
    }
  }, [timezone, fetchBrief]);

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

  const dateLabel = mounted ? format(new Date(), 'EEE, MMM d') : '';
  const greeting  = mounted ? getGreeting() : 'Today';
  const meetingText = brief
    ? (brief.eventCount === 0 ? 'No meetings' : `${brief.eventCount} meeting${brief.eventCount !== 1 ? 's' : ''}`)
    : null;
  const focusText = brief?.bestFocusWindow
    ? `${brief.bestFocusWindow.startTime}–${brief.bestFocusWindow.endTime}`
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="card-lift bg-card border border-border/70 rounded-xl p-5"
    >
      {/* Header — greeting + date + compact meta line */}
      <div className="mb-3">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground">{greeting}</h3>
          {mounted && (
            <span className="text-[11px] text-muted-foreground">· {dateLabel}</span>
          )}
        </div>
        {mounted && (meetingText || focusText) && (
          <div className="flex items-center gap-2.5 mt-1 text-[11px] text-muted-foreground/80">
            {meetingText && (
              <span className="inline-flex items-center gap-1">
                <CalendarIcon />
                <span>{meetingText}</span>
              </span>
            )}
            {meetingText && focusText && <span className="text-border">·</span>}
            {focusText && (
              <span className="inline-flex items-center gap-1 text-primary/80">
                <ClockIcon />
                <span>Focus {focusText}</span>
              </span>
            )}
          </div>
        )}
      </div>

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
