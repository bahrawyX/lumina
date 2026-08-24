'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';

// Route-scoped preload for the streak-fire Lottie used on /performance.
// Replaces the global preload in app/layout (see Bug #4).
if (typeof window !== 'undefined') {
  ReactDOM.preload('/animations/streak-fire.json', { as: 'fetch', crossOrigin: 'anonymous' });
}
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isWithinInterval, parseISO, subDays } from 'date-fns';
import { useCalendarEventsStore } from '@/store/useCalendarEventsStore';
import { useTaskBoardStore } from '@/store/useTaskBoardStore';
import { useFocusStore } from '@/store/useFocusStore';
import { useStreakStore } from '@/store/useStreakStore';
import { useCoinsStore, selectConsumables } from '@/store/useCoinsStore';
import { CoinsBadge } from '@/components/coins/CoinsBadge';
import { timeToMinutes } from '@/utils/time/timeUtils';
import { computeBestDay } from '@/utils/performance/bestDay';
import ContributionHeatmap from '@/components/performance/contributions/ContributionHeatmap';
import { Skeleton as SkeletonPrimitive } from '@/components/ui/skeleton';
import { Skeleton } from '@/components/ui/LoadingBoundary';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { LottieAnimation, STREAK_FIRE_LAYER_MAP } from '@/components/ui/LottieAnimation';
import { FireIcon, LightningIcon, TrophyIcon, CoinIcon, GemIcon } from '@/components/ui/AnimatedIcons';
import { useAchievementsStore } from '@/store/useAchievementsStore';
import { requestStreakRecovery } from '@/lib/persistence/streakPersistence';

// ── Metric card ───────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, sub, accent = 'text-primary' }) => (
  <div className="flex flex-col gap-1 p-4 rounded-2xl bg-card border border-border shadow-sm">
    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">{label}</span>
    <span className={`font-display text-2xl font-bold tabular-nums leading-none ${accent}`}>{value}</span>
    {sub && <span className="text-[11px] text-muted-foreground/50 mt-0.5">{sub}</span>}
  </div>
);

// ── Day bar ───────────────────────────────────────────────────────────────────

const DayBar: React.FC<{ day: string; mins: number; maxMins: number; isBest: boolean }> = ({ day, mins, maxMins, isBest }) => {
  const pct = maxMins > 0 ? (mins / maxMins) * 100 : 0;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return (
    <div className="flex items-end gap-2">
      <span className={`w-8 text-[11px] font-medium tabular-nums ${isBest ? 'text-primary font-bold' : 'text-muted-foreground'}`}>{day}</span>
      <div className="flex-1 h-6 bg-muted/30 rounded-md ">
        <div
          className={`h-full rounded-md transition-all duration-300 ${isBest ? 'bg-primary' : 'bg-primary/40'}`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <span className="w-12 text-right text-[11px] tabular-nums text-muted-foreground">
        {h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`}
      </span>
    </div>
  );
};

// ── Context pill ──────────────────────────────────────────────────────────────

const ContextPill: React.FC<{ name: string; count: number; total: number }> = ({ name, count, total }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-muted/30 border border-border/70">
      <span className="text-xs font-medium text-foreground truncate">{name}</span>
      <span className="text-[11px] tabular-nums text-muted-foreground">{count} <span className="text-muted-foreground/40">({pct}%)</span></span>
    </div>
  );
};

// ── Achievement metadata ──────────────────────────────────────────────────────

const ACHIEVEMENT_META: Record<string, { label: string; emoji: string; description: string }> = {
  first_session:        { label: 'First Focus',      emoji: '🎯', description: 'Completed your first focus session' },
  streak_3:             { label: '3-Day Streak',      emoji: '🔥', description: 'Maintained a 3-day daily streak' },
  streak_7:             { label: 'Week Warrior',      emoji: '⚡', description: 'Maintained a 7-day daily streak' },
  streak_30:            { label: 'Month Master',      emoji: '🏆', description: 'Maintained a 30-day daily streak' },
  session_streak_5:     { label: 'On a Roll',         emoji: '🌊', description: 'Completed 5 sessions in a row' },
  session_streak_10:    { label: 'Flow State',        emoji: '💎', description: 'Completed 10 sessions in a row' },
  coins_100:            { label: 'First 100',         emoji: '🪙', description: 'Earned 100 coins total' },
  coins_1000:           { label: 'High Roller',       emoji: '💰', description: 'Earned 1 000 coins total' },
  coins_10000:          { label: 'Coin Hoarder',      emoji: '🏦', description: 'Earned 10 000 coins total' },
};

function getAchievementMeta(type: string) {
  return ACHIEVEMENT_META[type] ?? { label: type, emoji: '🏅', description: 'Achievement unlocked' };
}

// ── Page ──────────────────────────────────────────────────────────────────────

// ── Streak stats row ──────────────────────────────────────────────────────────

const StreakStatsRow: React.FC = () => {
  const { dailyStreak, sessionStreak, bestDailyStreak } = useStreakStore();
  const hydrateStreaks = useStreakStore((s) => s.hydrateFromAPI);
  // Coin balance is owned by useCoinsStore — the DB-backed single source of
  // truth, rendered through the shared <CoinsBadge /> component so the
  // value + visual stays in lockstep with the calendar brief and shop.
  const consumables = useCoinsStore(selectConsumables);
  const refetchCoins = useCoinsStore((s) => s.refetchBalance);
  const focusHistory = useFocusStore((s) => s.sessionHistory);
  const best = useMemo(() => computeBestDay(focusHistory), [focusHistory]);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const shieldCount = consumables.streakShield ?? 0;
  const showRecovery = dailyStreak === 0 && bestDailyStreak > 3;

  const streakStartLabel = useMemo(() => {
    if (dailyStreak <= 0) return null;
    const start = subDays(new Date(), Math.max(0, dailyStreak - 1));
    return format(start, 'MMM d');
  }, [dailyStreak]);

  const handleRecover = async () => {
    if (recovering) return;
    setRecovering(true);
    setRecoveryError(null);
    const res = await requestStreakRecovery();
    setRecovering(false);
    if (res.ok) {
      // Pull fresh values for both stores so the UI reflects the updated
      // streak count and decremented shield consumable.
      await Promise.all([hydrateStreaks(), refetchCoins()]);
      setRecoveryOpen(false);
    } else {
      setRecoveryError(
        res.reason === 'payment_required'
          ? 'You don\'t have a streak shield. Visit the shop to get one.'
          : 'Could not recover streak. Try again later.',
      );
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="streak-stats-row">
        <div className="flex flex-col gap-1 p-4 rounded-2xl bg-card border border-border shadow-sm" data-testid="card-daily-streak">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">Daily Streak</span>
          <div className="flex items-center gap-1.5">
            {dailyStreak > 0 ? (
              <LottieAnimation
                path="/animations/streak-fire.json"
                layerColorMap={STREAK_FIRE_LAYER_MAP}
                width={32}
                height={40}
                loop={true}
                autoplay={true}
                className="flex-shrink-0"
              />
            ) : (
              <FireIcon size={22} />
            )}
            <span className="font-display text-2xl font-bold tabular-nums leading-none text-foreground" data-testid="daily-streak-value">
              {dailyStreak}
            </span>
            <span className="text-xs text-muted-foreground">days</span>
          </div>
          {streakStartLabel && (
            <span className="text-[11px] text-muted-foreground/60 mt-0.5">since {streakStartLabel}</span>
          )}
          {bestDailyStreak > 0 && (
            <span className="text-[11px] text-muted-foreground/60 mt-0.5" data-testid="best-streak-value">
              best: {bestDailyStreak} day{bestDailyStreak === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1 p-4 rounded-2xl bg-card border border-border shadow-sm">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">Session Streak</span>
          <div className="flex items-baseline gap-1.5">
            <LightningIcon size={22} />
            <span className="font-display text-2xl font-bold tabular-nums leading-none text-foreground">
              {sessionStreak}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1 p-4 rounded-2xl bg-card border border-border shadow-sm">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">Best Day</span>
          <div className="flex items-baseline gap-1.5">
            <TrophyIcon size={22} />
            <span className="font-display text-lg font-bold leading-none text-foreground">
              {best ? best.label : '—'}
            </span>
          </div>
          {best && <span className="text-[11px] text-muted-foreground/50">{Math.floor(best.totalMinutes / 60)}h {best.totalMinutes % 60}m focused</span>}
        </div>
        <CoinsBadge
          variant="card"
          data-testid="card-coins"
          caption={shieldCount > 0 ? `shields: ${shieldCount}` : undefined}
        />
      </div>

      {showRecovery && (
        <div className="rounded-2xl bg-card border border-border p-4 flex items-center justify-between gap-3" data-testid="streak-recovery-banner">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Lost your streak?</p>
            <p className="text-xs text-muted-foreground">
              You had a {bestDailyStreak}-day streak.
              {shieldCount > 0
                ? ` Use a streak shield to restore it. (${shieldCount} available)`
                : ' Buy a streak shield in the shop to restore it.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setRecoveryError(null);
              setRecoveryOpen(true);
            }}
            disabled={shieldCount <= 0}
            data-testid="streak-recovery-trigger"
            className="flex-shrink-0 px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 text-sm font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary/10"
          >
            <span className="flex items-center gap-1.5">Restore Streak <GemIcon size={16} /></span>
          </button>
        </div>
      )}

      <Dialog open={recoveryOpen} onOpenChange={setRecoveryOpen}>
        <DialogContent className="sm:max-w-[380px] bg-card border-border rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">Streak Recovery</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {shieldCount > 0
                ? `Use one streak shield to restore your ${bestDailyStreak}-day streak. You have ${shieldCount} shield${shieldCount === 1 ? '' : 's'}.`
                : 'You don\'t have any streak shields. Visit the shop to get one.'}
            </DialogDescription>
          </DialogHeader>
          {recoveryError && (
            <p className="text-xs text-destructive" role="alert">{recoveryError}</p>
          )}
          <button
            type="button"
            disabled={shieldCount <= 0 || recovering}
            onClick={handleRecover}
            data-testid="streak-recovery-confirm"
            className="w-full py-2.5 rounded-xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {recovering ? 'Restoring…' : shieldCount > 0 ? 'Use streak shield' : 'No shield available'}
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
};

// ── Lifetime stats ────────────────────────────────────────────────────────────

interface LifetimeStats {
  totalSessions: number;
  totalMinutes: number;
  avgMinutes: number;
  busiestHour: number | null;
  busiestWeekday: string | null;
}

function computeLifetimeStats(sessions: { startTime: string; duration: number; completed: boolean }[]): LifetimeStats {
  let totalSessions = 0;
  let totalMinutes = 0;
  const hourCounts = new Map<number, number>();
  const weekdayCounts = new Map<number, number>();

  for (const s of sessions) {
    if (!s.completed) continue;
    totalSessions += 1;
    const mins = Math.max(0, Math.round(s.duration / 60));
    totalMinutes += mins;
    try {
      const d = parseISO(s.startTime);
      if (!isNaN(d.getTime())) {
        const hour = d.getHours();
        const weekday = d.getDay();
        hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + mins);
        weekdayCounts.set(weekday, (weekdayCounts.get(weekday) ?? 0) + mins);
      }
    } catch { /* swallow */ }
  }

  let busiestHour: number | null = null;
  let busiestHourMins = 0;
  hourCounts.forEach((m, h) => { if (m > busiestHourMins) { busiestHourMins = m; busiestHour = h; } });

  let busiestWeekdayIdx: number | null = null;
  let busiestWeekdayMins = 0;
  weekdayCounts.forEach((m, w) => { if (m > busiestWeekdayMins) { busiestWeekdayMins = m; busiestWeekdayIdx = w; } });

  const avgMinutes = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;
  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return {
    totalSessions,
    totalMinutes,
    avgMinutes,
    busiestHour,
    busiestWeekday: busiestWeekdayIdx === null ? null : weekdayLabels[busiestWeekdayIdx],
  };
}

function formatHourBucket(hour: number): string {
  // 6 → "6–7am", 13 → "1–2pm"
  const start = hour;
  const end = (hour + 1) % 24;
  const fmt = (h: number) => {
    if (h === 0) return '12am';
    if (h === 12) return '12pm';
    if (h < 12) return `${h}am`;
    return `${h - 12}pm`;
  };
  return `${fmt(start)}–${fmt(end)}`;
}

const LifetimeStatsSection: React.FC = () => {
  const focusHistory = useFocusStore((s) => s.sessionHistory);
  const stats = useMemo(() => computeLifetimeStats(focusHistory), [focusHistory]);

  return (
    <div data-testid="lifetime-stats-section">
      <h3 className="font-display text-sm font-semibold text-foreground mb-3">All-time Stats</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Total Sessions"
          value={stats.totalSessions}
          sub={stats.totalSessions === 1 ? 'session' : 'sessions'}
        />
        <MetricCard
          label="Total Focus"
          value={`${Math.floor(stats.totalMinutes / 60)}h ${stats.totalMinutes % 60}m`}
          sub="lifetime"
        />
        <MetricCard
          label="Avg Session"
          value={stats.avgMinutes > 0 ? `${stats.avgMinutes}m` : '—'}
          sub="per session"
        />
        <MetricCard
          label="Peak Time"
          value={
            stats.busiestHour !== null
              ? formatHourBucket(stats.busiestHour)
              : '—'
          }
          sub={stats.busiestWeekday ? `best day: ${stats.busiestWeekday}` : 'most productive hour'}
        />
      </div>
    </div>
  );
};

// ── Achievements section ──────────────────────────────────────────────────────

const AchievementsSection: React.FC = () => {
  const { achievements, markSeen } = useAchievementsStore();

  useEffect(() => {
    const unseen = achievements.filter((a) => !a.seen).map((a) => a.id);
    if (unseen.length > 0) markSeen(unseen);
  }, [achievements, markSeen]);

  if (achievements.length === 0) return null;

  return (
    <div>
      <h3 className="font-display text-sm font-semibold text-foreground mb-3">
        Achievements
        <span className="ml-2 text-[10px] font-semibold tabular-nums text-muted-foreground bg-muted rounded-full px-2 py-0.5 border border-border/50">
          {achievements.length}
        </span>
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {achievements.map((a) => {
          const meta = getAchievementMeta(a.type);
          return (
            <div
              key={a.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border shadow-sm"
            >
              <span className="text-2xl leading-none flex-shrink-0">{meta.emoji}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{meta.label}</p>
                <p className="text-[10px] text-muted-foreground/60 truncate">{meta.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const PerformancePage: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const events = useCalendarEventsStore((s) => s.events);
  const tasks = useTaskBoardStore((s) => s.tasks);
  const focusHistory = useFocusStore((s) => s.sessionHistory);

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const weekInterval = { start: weekStart, end: weekEnd };

  // ── Derived data ──────────────────────────────────────────────────────────

  const weekEvents = useMemo(
    () => events.filter((e) => {
      try { return isWithinInterval(parseISO(e.date), weekInterval); } catch { return false; }
    }),
    [events, weekInterval.start.getTime(), weekInterval.end.getTime()]
  );

  const completedTasks = useMemo(
    () => tasks.filter((t) => {
      if (t.status !== 'done') return false;
      try { return isWithinInterval(parseISO(t.updatedAt), weekInterval); } catch { return false; }
    }),
    [tasks, weekInterval.start.getTime(), weekInterval.end.getTime()]
  );

  const weekFocusSessions = useMemo(
    () => focusHistory.filter((s) => {
      try { return isWithinInterval(parseISO(s.startTime), weekInterval); } catch { return false; }
    }),
    [focusHistory, weekInterval.start.getTime(), weekInterval.end.getTime()]
  );

  const totalFocusMins = useMemo(
    () => Math.round(weekFocusSessions.reduce((s, f) => s + f.duration, 0) / 60),
    [weekFocusSessions]
  );

  const completedFocusSessions = useMemo(
    () => weekFocusSessions.filter((s) => s.completed),
    [weekFocusSessions]
  );

  // Scheduled vs completed events
  const scheduledCount = weekEvents.length;
  const completedEventCount = weekEvents.filter((e) => e.completed).length;
  const completionRatio = scheduledCount > 0 ? Math.round((completedEventCount / scheduledCount) * 100) : 0;

  // Per-day productive minutes (events duration)
  const dayProductivity = useMemo(() => {
    return weekDays.map((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayLabel = format(day, 'EEE');
      const dayEvents = weekEvents.filter((e) => e.date === dateStr);
      const mins = dayEvents.reduce((sum, e) => {
        if (!e.startTime || !e.endTime) return sum;
        return sum + Math.max(0, timeToMinutes(e.endTime) - timeToMinutes(e.startTime));
      }, 0);
      return { dateStr, dayLabel, mins };
    });
  }, [weekDays, weekEvents]);

  const bestDay = useMemo(() => {
    let best = dayProductivity[0];
    for (const d of dayProductivity) { if (d.mins > best.mins) best = d; }
    return best;
  }, [dayProductivity]);

  // Cap scale at 8 h — a full bar = 8 h worked; anything over 8 h still fills 100%
  const maxDayMins = 8 * 60;

  // Deep work: focus sessions >= 25 minutes
  const deepWorkMins = useMemo(
    () => Math.round(completedFocusSessions.filter((s) => s.duration >= 25 * 60).reduce((sum, s) => sum + s.duration, 0) / 60),
    [completedFocusSessions]
  );

  // Context usage
  const contextCounts = useMemo(() => {
    const map: Record<string, number> = {};
    weekEvents.forEach((e) => {
      const ctx = e.category || 'Uncategorized';
      map[ctx] = (map[ctx] || 0) + 1;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6);
  }, [weekEvents]);

  // ── Render ────────────────────────────────────────────────────────────────

  const weekLabel = `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;
  const noData = weekEvents.length === 0 && completedTasks.length === 0 && weekFocusSessions.length === 0;

  return (
    <Skeleton
      name="page.PerformancePage"
      loading={!mounted}
      fallback={
          <>
            <header className="flex items-center justify-between mb-6 lg:mb-10 px-2 lg:px-4">
              <div className="flex flex-col gap-2">
                <SkeletonPrimitive className="h-9 lg:h-10 w-48 rounded-lg" />
                <SkeletonPrimitive className="h-4 w-36 rounded" />
              </div>
            </header>
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-2 lg:px-4 pb-10">
              <div className="space-y-8 max-w-6xl">
                <SkeletonPrimitive className="h-32 w-full rounded-2xl" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex flex-col gap-2 p-4 rounded-2xl bg-card border border-border">
                      <SkeletonPrimitive className="h-3 w-20 rounded" />
                      <SkeletonPrimitive className="h-8 w-20 rounded-md" />
                      <SkeletonPrimitive className="h-3 w-24 rounded" />
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  {[1, 2, 3, 4, 5, 6, 7].map(i => (
                    <div key={i} className="flex items-end gap-2">
                      <SkeletonPrimitive className="w-8 h-4 rounded" />
                      <SkeletonPrimitive className="flex-1 h-6 rounded-md" />
                      <SkeletonPrimitive className="w-12 h-4 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        }
      >
    <>
      <header className="flex items-end justify-between mb-6 lg:mb-8 pb-5 lg:pb-6 px-2 lg:px-4 border-b border-border/60">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 mb-2">
            Workspace · Analytics
          </p>
          <h2 className="font-display text-3xl lg:text-4xl font-medium tracking-[-0.035em] leading-none">
            Weekly Review
          </h2>
          <p className="font-mono text-xs text-muted-foreground/80 mt-2.5">{weekLabel}</p>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-2 lg:px-4 pb-10">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-8 max-w-6xl"
        >
          <StreakStatsRow />
          <ContributionHeatmap />
          <LifetimeStatsSection />

          {noData ? (
            <div className="rounded-2xl border border-border bg-card px-6 py-12 flex flex-col items-center justify-center gap-3">
              <p className="text-lg font-medium text-muted-foreground/60">No activity this week yet</p>
              <p className="text-sm text-muted-foreground/40">Complete some tasks or log focus time this week to see data here.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* ── Metrics grid ──────────────────────────────────────── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard label="Tasks Done" value={completedTasks.length} sub="this week" />
                <MetricCard label="Focus Time" value={`${Math.floor(totalFocusMins / 60)}h ${totalFocusMins % 60}m`} sub={`${completedFocusSessions.length} sessions`} />
                <MetricCard label="Completion" value={`${completionRatio}%`} sub={`${completedEventCount}/${scheduledCount} events`} />
                <MetricCard label="Deep Work" value={`${Math.floor(deepWorkMins / 60)}h ${deepWorkMins % 60}m`} sub="focus ≥ 25m" accent="text-emerald-600 dark:text-emerald-400" />
              </div>

              {/* ── Daily breakdown ────────────────────────────────────── */}
              <div>
                <h3 className="font-display text-sm font-semibold text-foreground mb-3">Daily Breakdown</h3>
                <div className="flex flex-col gap-2">
                  {dayProductivity.map((d) => (
                    <DayBar
                      key={d.dateStr}
                      day={d.dayLabel}
                      mins={d.mins}
                      maxMins={maxDayMins}
                      isBest={d.dateStr === bestDay.dateStr && d.mins > 0}
                    />
                  ))}
                </div>
                {bestDay.mins > 0 && (
                  <p className="text-[11px] text-muted-foreground/50 mt-2">
                    Best day: <span className="font-medium text-primary">{bestDay.dayLabel}</span> with {Math.floor(bestDay.mins / 60)}h {bestDay.mins % 60}m scheduled
                  </p>
                )}
              </div>

              {/* ── Context breakdown ──────────────────────────────────── */}
              {contextCounts.length > 0 && (
                <div>
                  <h3 className="font-display text-sm font-semibold text-foreground mb-3">Top Contexts</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {contextCounts.map(([ctx, count]) => (
                      <ContextPill key={ctx} name={ctx} count={count} total={weekEvents.length} />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Achievements ──────────────────────────────────────── */}
              <AchievementsSection />

              {/* ── Completed tasks list ───────────────────────────────── */}
              {completedTasks.length > 0 && (
                <div>
                  <h3 className="font-display text-sm font-semibold text-foreground mb-3">Completed Tasks</h3>
                  <div className="space-y-1.5">
                    {completedTasks.slice(0, 15).map((t) => (
                      <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/30 border border-border/30">
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 flex-shrink-0">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span className="text-xs font-medium text-foreground truncate">{t.title}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground/40 tabular-nums flex-shrink-0">
                          {format(parseISO(t.updatedAt), 'EEE')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </>
    </Skeleton>
  );
};

export default PerformancePage;
