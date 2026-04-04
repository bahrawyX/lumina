'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { useDailyBriefStore, type DailyBriefData } from '@/store/useDailyBriefStore';
import { useCalendarStore } from '@/store/useCalendarStore';
import { useGuestStore } from '@/store/useGuestStore';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

const SkeletonCard: React.FC = () => (
  <div className="mx-4 mt-4 mb-2 rounded-2xl border border-border/60 bg-card p-4">
    <div className="flex items-center gap-3">
      <div className="h-3 w-28 bg-muted rounded animate-pulse" />
      <div className="h-3 w-48 bg-muted rounded animate-pulse" />
    </div>
  </div>
);

// ── Stat chip ────────────────────────────────────────────────────────────────

interface ChipProps {
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const Chip: React.FC<ChipProps> = ({ icon, children, className = '' }) => (
  <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground ${className}`}>
    <span className="opacity-60">{icon}</span>
    {children}
  </span>
);

// ── Icons (inline, tiny) ────────────────────────────────────────────────────

const CalIcon = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="2" x2="9" y2="6" /><line x1="15" y1="2" x2="15" y2="6" />
  </svg>
);

const TargetIcon = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
  </svg>
);

const FireIcon = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2c1 4-2 7-2 10a4 4 0 0 0 8 0c0-3-1-4-2-6-1 2-3 3-4 3s1-4 0-7z" />
  </svg>
);

const AlertIcon = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

// ── Main component ───────────────────────────────────────────────────────────

export const DailyBriefCard: React.FC = () => {
  const timezone = useCalendarStore((s) => s.timezone);
  const isGuest = useGuestStore((s) => s.isGuest);

  const brief = useDailyBriefStore((s) => s.brief);
  const isLoading = useDailyBriefStore((s) => s.isLoading);
  const error = useDailyBriefStore((s) => s.error);
  const lastFetched = useDailyBriefStore((s) => s.lastFetched);
  const fetchBrief = useDailyBriefStore((s) => s.fetchBrief);
  const refreshBrief = useDailyBriefStore((s) => s.refresh);
  const dismiss = useDailyBriefStore((s) => s.dismiss);
  const shouldShow = useDailyBriefStore((s) => s.shouldShow);
  const isDismissedToday = useDailyBriefStore((s) => s.isDismissedToday);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const retryCountRef = React.useRef(0);

  // ── Hydration guard — avoid SSR/client mismatch for time-dependent UI ───
  useEffect(() => { setMounted(true); }, []);

  // ── Fetch on mount / day change ──────────────────────────────────────────
  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const needsFetch = !lastFetched || !lastFetched.startsWith(today);
    // Also auto-retry once if we have a cached error and no brief
    const shouldRetry = !brief && error && !isLoading && retryCountRef.current < 2;
    if ((needsFetch || shouldRetry) && !isLoading) {
      retryCountRef.current += 1;
      fetchBrief(timezone);
    }
    // Reset retry count on successful fetch
    if (brief) retryCountRef.current = 0;
  }, [timezone, fetchBrief, lastFetched, isLoading, brief, error]);

  // ── Tab visibility handler ───────────────────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const today = format(new Date(), 'yyyy-MM-dd');
        const { lastFetched: lf } = useDailyBriefStore.getState();
        if (lf && !lf.startsWith(today)) {
          fetchBrief(timezone);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [timezone, fetchBrief]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshBrief(timezone);
    setIsRefreshing(false);
  }, [refreshBrief, timezone]);

  // ── Render guards ────────────────────────────────────────────────────────
  if (!mounted) return null;

  const dismissed = isDismissedToday();

  if (dismissed) return null;
  if (isLoading && !brief) return <SkeletonCard />;

  if (error && !brief) {
    return (
      <div className="mx-4 mt-4 mb-2 rounded-2xl border border-border/60 bg-card p-4">
        <p className="text-xs text-muted-foreground">
          Couldn&apos;t load your brief.{' '}
          <button
            onClick={() => fetchBrief(timezone)}
            className="text-primary hover:underline font-medium"
          >
            Retry
          </button>
        </p>
      </div>
    );
  }

  if (!brief || !shouldShow()) return null;

  const greeting = getGreeting();
  const dateLabel = format(new Date(), 'EEE, MMM d');

  // Build quick stat chips
  const meetingText = brief.eventCount === 0
    ? 'No meetings'
    : `${brief.eventCount} meeting${brief.eventCount !== 1 ? 's' : ''}`;

  const focusText = brief.bestFocusWindow
    ? `${brief.bestFocusWindow.startTime}–${brief.bestFocusWindow.endTime}`
    : null;

  const streakText = brief.currentStreak > 0
    ? `${brief.currentStreak}-day streak`
    : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6, height: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="mx-4 mt-4 mb-2 rounded-2xl border border-border/60 bg-card shadow-sm"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Greeting + date */}
          <p className="text-xs font-medium text-foreground whitespace-nowrap">
            {greeting}
            <span className="text-muted-foreground font-normal"> · {dateLabel}</span>
          </p>

          {/* Separator */}
          <div className="w-px h-4 bg-border/60 hidden sm:block" />

          {/* Stat chips — scrollable on mobile, flex on desktop */}
          <div className="flex-1 flex items-center gap-3 overflow-x-auto no-scrollbar min-w-0">
            <Chip icon={<CalIcon />}>{meetingText}</Chip>

            {focusText && (
              <Chip icon={<TargetIcon />}>
                Focus {focusText}
              </Chip>
            )}

            {brief.overdueCount > 0 && (
              <Chip icon={<AlertIcon />} className="text-amber-600 dark:text-amber-400">
                {brief.overdueCount} overdue
              </Chip>
            )}

            {streakText && (
              <Chip icon={<FireIcon />} className={brief.isStreakAtRisk ? 'text-amber-600 dark:text-amber-400' : ''}>
                {streakText}
              </Chip>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40"
              aria-label="Refresh brief"
            >
              <svg
                width={13}
                height={13}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={isRefreshing ? 'animate-spin' : ''}
              >
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              </svg>
            </button>
            <button
              onClick={dismiss}
              className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label="Dismiss"
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default DailyBriefCard;
