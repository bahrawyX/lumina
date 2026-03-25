'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useIntelligenceStore } from '@/store/useIntelligenceStore';
import { IntelligenceRecommendationCard } from './IntelligenceRecommendationCard';

interface IntelligencePanelProps {
  open: boolean;
  onClose: () => void;
}

const skeletonRows = Array.from({ length: 4 }, (_, i) => i);

function ConflictAlerts() {
  const conflicts = useIntelligenceStore((s) => s.data?.conflicts ?? []);
  if (conflicts.length === 0) return null;

  return (
    <div className="space-y-2">
      {conflicts.slice(0, 3).map((conflict, idx) => (
        <div
          key={`${conflict.type}-${conflict.start}-${idx}`}
          className="rounded-xl p-[1px] bg-gradient-to-r from-amber-500/35 via-orange-400/20 to-rose-500/30"
        >
          <div className="rounded-xl bg-[#0a0a0a]/80 px-3 py-2 border border-white/5">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-amber-300">⚠</span>
              <div>
                <p className="text-[11px] uppercase tracking-[0.13em] text-amber-200/85">Conflict detected</p>
                <p className="text-xs text-zinc-200/90 mt-0.5">{conflict.reason}</p>
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
        <div key={row} className="rounded-xl border border-white/5 bg-white/[0.02] p-4 animate-pulse">
          <div className="h-3 w-24 rounded bg-white/10" />
          <div className="mt-3 h-3 w-full rounded bg-white/10" />
          <div className="mt-2 h-3 w-3/4 rounded bg-white/10" />
          <div className="mt-4 h-8 w-20 rounded-lg bg-white/10 ml-auto" />
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
            className="absolute inset-0 z-20 bg-black/40"
            aria-label="Close intelligence panel"
          />

          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="absolute right-0 top-0 z-30 h-full w-full sm:w-[420px] bg-[#0a0a0a]/80 backdrop-blur-xl border-l border-white/10 text-white"
          >
            <div className="h-full flex flex-col">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold tracking-wide">Explainability Panel</h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Actionable intelligence for your day</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fetchIntelligence(true)}
                    className="h-8 px-2.5 rounded-lg border border-white/15 bg-white/[0.03] text-xs hover:bg-white/[0.07]"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-8 w-8 rounded-lg border border-white/15 bg-white/[0.03] hover:bg-white/[0.07]"
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
                  <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                    {error}
                  </div>
                )}

                {!isLoading && !error && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-400">Recommendations</p>
                      <p className="text-[11px] text-zinc-500">{visibleRecommendations.length} active</p>
                    </div>

                    <AnimatePresence mode="popLayout">
                      {visibleRecommendations.map((recommendation) => (
                        <IntelligenceRecommendationCard
                          key={recommendation.id}
                          recommendation={recommendation}
                        />
                      ))}
                    </AnimatePresence>

                    {visibleRecommendations.length === 0 && (
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-300">
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
