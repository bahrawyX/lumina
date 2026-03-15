'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isWithinInterval, parseISO } from 'date-fns';
import { useCalendarEventsStore } from '@/store/useCalendarEventsStore';
import { useTaskBoardStore } from '@/store/useTaskBoardStore';
import { useFocusStore } from '@/store/useFocusStore';
import { timeToMinutes } from '@/utils/time/timeUtils';
import ContributionHeatmap from '@/components/performance/contributions/ContributionHeatmap';

// ── Metric card ───────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, sub, accent = 'text-primary' }) => (
  <div className="flex flex-col gap-1 p-4 rounded-2xl bg-card border border-border/60 shadow-sm">
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
      <div className="flex-1 h-6 bg-muted/30 rounded-md overflow-hidden">
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
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-muted/30 border border-border/40">
      <span className="text-xs font-medium text-foreground truncate">{name}</span>
      <span className="text-[11px] tabular-nums text-muted-foreground">{count} <span className="text-muted-foreground/40">({pct}%)</span></span>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const PerformancePage: React.FC = () => {
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

  const maxDayMins = useMemo(() => Math.max(...dayProductivity.map((d) => d.mins), 1), [dayProductivity]);

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
    <>
      <header className="flex items-center justify-between mb-6 lg:mb-10 px-2 lg:px-4">
        <div>
          <h2 className="font-display text-3xl lg:text-4xl font-semibold tracking-tight">
            Weekly Review
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{weekLabel}</p>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-2 lg:px-4 pb-10">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-8 max-w-6xl"
        >
          <ContributionHeatmap />

          {noData ? (
            <div className="rounded-2xl border border-border/40 bg-card/60 px-6 py-12 flex flex-col items-center justify-center gap-3">
              <p className="text-lg font-medium text-muted-foreground/60">No activity this week yet</p>
              <p className="text-sm text-muted-foreground/40">Start scheduling events and completing tasks to see your weekly review details.</p>
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
  );
};

export default PerformancePage;
