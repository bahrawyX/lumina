'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { useDailyBriefStore, type DailyBriefData } from '@/store/useDailyBriefStore';
import { useCalendarStore } from '@/store/useCalendarStore';
import { useGuestStore } from '@/store/useGuestStore';
import { LottieIcon } from '@/components/ui/LottieIcon';

import calendarLottie from '@/assets/lotties/calendar.json';
import clockLottie from '@/assets/lotties/clock.json';
import targetLottie from '@/assets/lotties/target.json';
import checkmarkLottie from '@/assets/lotties/checkmark.json';
import warningLottie from '@/assets/lotties/warning.json';
import fireLottie from '@/assets/lotties/fire.json';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDateLabel(): string {
  return format(new Date(), 'EEEE, MMMM d');
}

// ── Stat row component ───────────────────────────────────────────────────────

interface StatRowProps {
  lottie: Record<string, unknown>;
  label: string;
  value: string;
  valueClassName?: string;
}

const StatRow: React.FC<StatRowProps> = ({ lottie, label, value, valueClassName }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="flex items-center gap-2 py-1"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <LottieIcon src={lottie} size={18} autoplay replay={hovered} />
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`text-xs font-medium ml-auto ${valueClassName ?? 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
};

// ── Skeleton ─────────────────────────────────────────────────────────────────

const SkeletonCard: React.FC = () => (
  <div className="mx-4 mt-4 mb-2 bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm border-t-2 border-t-primary/60">
    <div className="flex flex-col md:flex-row">
      <div className="flex-1 p-5 space-y-3">
        <div className="h-3 w-40 bg-muted rounded animate-pulse" />
        <div className="h-3 w-full bg-muted rounded animate-pulse" />
        <div className="h-3 w-3/4 bg-muted rounded animate-pulse" />
      </div>
      <div className="md:border-l border-border/40 bg-muted/40 p-4 md:w-64 space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-3 w-full bg-muted/60 rounded animate-pulse" />
        ))}
      </div>
    </div>
  </div>
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

  // ── Fetch on mount / day change ──────────────────────────────────────────
  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const needsFetch = !lastFetched || !lastFetched.startsWith(today);
    if (needsFetch && !isLoading) {
      fetchBrief(timezone);
    }
  }, [timezone, fetchBrief, lastFetched, isLoading]);

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
  const dismissed = isDismissedToday();

  if (dismissed) return null;
  if (isLoading && !brief) return <SkeletonCard />;

  if (error && !brief) {
    return (
      <div className="mx-4 mt-4 mb-2 bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm p-5 border-t-2 border-t-primary/60">
        <p className="text-sm text-muted-foreground">
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

  const userName = isGuest ? 'there' : (brief as DailyBriefData & { userName?: string }).userName;
  const greeting = getGreeting();
  const dateLabel = formatDateLabel();
  const narrativeText = isGuest
    ? 'Sign in to get a personalised daily summary.'
    : brief.narrative;

  // ── Next event urgency color ─────────────────────────────────────────────
  let nextEventColor = 'text-foreground';
  if (brief.nextEvent) {
    if (brief.nextEvent.minutesUntil < 0) nextEventColor = 'text-muted-foreground';
    else if (brief.nextEvent.minutesUntil < 15) nextEventColor = 'text-amber-500 dark:text-amber-400';
  }

  // ── Next event label ─────────────────────────────────────────────────────
  let nextEventLabel = '';
  if (brief.nextEvent) {
    if (brief.nextEvent.minutesUntil < 0) {
      nextEventLabel = `${brief.nextEvent.title} (in progress)`;
    } else if (brief.nextEvent.minutesUntil < 60) {
      nextEventLabel = `${brief.nextEvent.title} in ${brief.nextEvent.minutesUntil} min`;
    } else {
      nextEventLabel = `${brief.nextEvent.title} at ${brief.nextEvent.startTime}`;
    }
  }

  // ── Streak label ─────────────────────────────────────────────────────────
  let streakLabel = `${brief.currentStreak}-day streak`;
  let streakColor = 'text-foreground';
  if (brief.isStreakAtRisk) {
    streakLabel += ' · at risk';
    streakColor = 'text-amber-500 dark:text-amber-400';
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8, height: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="mx-4 mt-4 mb-2 bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm border-t-2 border-t-primary/60"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-0">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium tracking-wide uppercase">
            <span>{greeting}{userName ? `, ${userName}` : ''}</span>
            <span className="opacity-50">·</span>
            <span>{dateLabel}</span>
          </div>
          <div className="flex items-center gap-1">
            {/* Refresh button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
              aria-label="Refresh brief"
            >
              <svg
                width={14}
                height={14}
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
            {/* Dismiss button */}
            <button
              onClick={dismiss}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label="Dismiss brief for today"
            >
              <svg
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content: narrative + stats */}
        <div className="flex flex-col md:flex-row">
          {/* Left: narrative */}
          <div className="flex-1 p-5 pt-3">
            {isRefreshing ? (
              <div className="space-y-2">
                <div className="h-3 w-full bg-muted rounded animate-pulse" />
                <div className="h-3 w-5/6 bg-muted rounded animate-pulse" />
                <div className="h-3 w-2/3 bg-muted rounded animate-pulse" />
              </div>
            ) : (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.3 }}
                className={`text-sm leading-relaxed ${
                  isGuest
                    ? 'text-muted-foreground italic'
                    : 'text-foreground'
                }`}
              >
                {narrativeText}
              </motion.p>
            )}
          </div>

          {/* Right: stats */}
          <div className="border-t md:border-t-0 md:border-l border-border/40 bg-muted/40 p-4 md:w-64">
            {/* Mobile: 2-col grid; Desktop: single column */}
            <div className="grid grid-cols-2 md:grid-cols-1 gap-x-4 gap-y-0">
              {/* Meetings */}
              <StatRow
                lottie={calendarLottie}
                label=""
                value={
                  brief.eventCount === 0
                    ? 'No meetings today'
                    : `${brief.eventCount} meeting${brief.eventCount !== 1 ? 's' : ''} · ${brief.meetingHours}h`
                }
              />

              {/* Next event */}
              {brief.nextEvent && (
                <StatRow
                  lottie={clockLottie}
                  label="Next:"
                  value={nextEventLabel}
                  valueClassName={nextEventColor}
                />
              )}

              {/* Focus window */}
              <StatRow
                lottie={targetLottie}
                label="Best focus:"
                value={
                  brief.bestFocusWindow
                    ? `${brief.bestFocusWindow.startTime} – ${brief.bestFocusWindow.endTime}`
                    : 'No free blocks today'
                }
                valueClassName={brief.bestFocusWindow ? 'text-foreground' : 'text-muted-foreground'}
              />

              {/* Top task */}
              {brief.topPriorityTask && (
                <StatRow
                  lottie={checkmarkLottie}
                  label="Top task:"
                  value={
                    brief.topPriorityTask.title.length > 24
                      ? brief.topPriorityTask.title.slice(0, 24) + '...'
                      : brief.topPriorityTask.title
                  }
                />
              )}

              {/* Overdue (only show if > 0) */}
              {brief.overdueCount > 0 && (
                <StatRow
                  lottie={warningLottie}
                  label=""
                  value={`${brief.overdueCount} overdue task${brief.overdueCount !== 1 ? 's' : ''}`}
                  valueClassName="text-destructive"
                />
              )}

              {/* Streak */}
              <StatRow
                lottie={fireLottie}
                label=""
                value={streakLabel}
                valueClassName={streakColor}
              />
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default DailyBriefCard;
