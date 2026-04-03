'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useIntelligenceStore, getPlannedTaskIds } from '@/store/useIntelligenceStore';
import { useDailyPlanStore, todayKey } from '@/store/useDailyPlanStore';
import { useTaskBoardStore } from '@/store/useTaskBoardStore';
import { IntelligenceRecommendationCard } from './IntelligenceRecommendationCard';

interface IntelligencePanelProps {
  open: boolean;
  onClose: () => void;
}

const skeletonRows = Array.from({ length: 4 }, (_, i) => i);

const EMPTY_CONFLICTS: never[] = [];
const EMPTY_PLAN: never[] = [];

function ConflictAlerts() {
  const conflicts = useIntelligenceStore((s) => s.data?.conflicts ?? EMPTY_CONFLICTS);
  if (conflicts.length === 0) return null;

  return (
    <div className="space-y-2">
      {conflicts.slice(0, 3).map((conflict, idx) => (
        <div
          key={`${conflict.type}-${conflict.start}-${idx}`}
          className="rounded-xl p-[1px] bg-gradient-to-r from-amber-500/35 via-orange-400/20 to-rose-500/30"
        >
          <div className="rounded-xl bg-card/80 px-3 py-2 border border-border/40">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-amber-500 dark:text-amber-300">⚠</span>
              <div>
                <p className="text-[11px] uppercase tracking-[0.13em] text-amber-600 dark:text-amber-200/85">Conflict detected</p>
                <p className="text-xs text-foreground/80 mt-0.5">{conflict.reason}</p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {skeletonRows.map((row) => (
        <div key={row} className="rounded-xl border border-border/40 bg-muted/20 p-4 animate-pulse">
          <div className="h-3 w-24 rounded bg-muted" />
          <div className="mt-3 h-3 w-full rounded bg-muted" />
          <div className="mt-2 h-3 w-3/4 rounded bg-muted" />
          <div className="mt-4 h-8 w-20 rounded-lg bg-muted ml-auto" />
        </div>
      ))}
    </div>
  );
}

export const IntelligencePanel: React.FC<IntelligencePanelProps> = ({ open, onClose }) => {
  const data = useIntelligenceStore((s) => s.data);
  const isLoading = useIntelligenceStore((s) => s.isLoading);
  const error = useIntelligenceStore((s) => s.error);
  const appliedRecommendationIds = useIntelligenceStore((s) => s.appliedRecommendationIds);
  const fetchIntelligence = useIntelligenceStore((s) => s.fetchIntelligence);

  React.useEffect(() => {
    if (!open) return;
    fetchIntelligence();
  }, [open, fetchIntelligence]);

  const plannedTaskIds = React.useMemo(() => getPlannedTaskIds(), [data]);
  const todayPlanItems = useDailyPlanStore((s) => s.plansByDate[todayKey()] ?? EMPTY_PLAN);
  const allTasks = useTaskBoardStore((s) => s.tasks);
  const openTaskCount = allTasks.filter((t) => t.status !== 'done').length;
  const allOpenTasksPlanned = openTaskCount > 0 && todayPlanItems.length >= openTaskCount;

  const visibleRecommendations = (data?.recommendations ?? []).filter(
    (item) => !appliedRecommendationIds.includes(item.id),
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 z-20 bg-black/30"
            aria-label="Close intelligence panel"
          />

          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="absolute right-0 top-0 z-30 h-full w-full sm:w-[420px] bg-card/95 backdrop-blur-xl border-l border-border text-foreground"
          >
            <div className="h-full flex flex-col">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold tracking-wide text-foreground">Insights Panel</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Actionable insights for your day</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fetchIntelligence(true)}
                    className="h-8 px-2.5 rounded-lg border border-border/60 bg-muted/30 text-xs text-foreground hover:bg-muted/60 transition-colors"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-8 w-8 rounded-lg border border-border/60 bg-muted/30 text-foreground hover:bg-muted/60 transition-colors"
                    aria-label="Close panel"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
                <ConflictAlerts />

                {isLoading && <LoadingSkeleton />}

                {!isLoading && error && (
                  <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-200">
                    {error}
                  </div>
                )}

                {!isLoading && !error && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Recommendations</p>
                      <p className="text-[11px] text-muted-foreground/70">{visibleRecommendations.length} active</p>
                    </div>

                    <AnimatePresence mode="popLayout">
                      {visibleRecommendations.map((recommendation) => (
                        <IntelligenceRecommendationCard
                          key={recommendation.id}
                          recommendation={recommendation}
                          plannedTaskIds={plannedTaskIds}
                        />
                      ))}
                    </AnimatePresence>

                    {visibleRecommendations.length === 0 && allOpenTasksPlanned && (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Your day is fully planned. Nice work.
                      </p>
                    )}

                    {visibleRecommendations.length === 0 && !allOpenTasksPlanned && (
                      <div className="rounded-xl border border-border/40 bg-muted/20 p-4 text-sm text-muted-foreground">
                        No pending recommendations right now.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
