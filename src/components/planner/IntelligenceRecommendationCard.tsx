'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import type { Recommendation } from '@/lib/intelligence/types';
import { useIntelligenceStore } from '@/store/useIntelligenceStore';

interface IntelligenceRecommendationCardProps {
  recommendation: Recommendation;
}

function priorityTone(priority: Recommendation['priority']): string {
  if (priority === 'high') return 'text-rose-300 border-rose-400/25 bg-rose-500/10';
  if (priority === 'medium') return 'text-amber-300 border-amber-400/25 bg-amber-500/10';
  return 'text-emerald-300 border-emerald-400/25 bg-emerald-500/10';
}

export const IntelligenceRecommendationCard: React.FC<IntelligenceRecommendationCardProps> = ({ recommendation }) => {
  const applyRecommendation = useIntelligenceStore((s) => s.applyRecommendation);
  const [isApplying, setIsApplying] = React.useState(false);

  const handleApply = async () => {
    if (isApplying) return;
    setIsApplying(true);
    try {
      const result = await applyRecommendation(recommendation);
      if (result.applied) {
        toast.success(result.message);
      } else {
        toast.message(result.message);
      }
    } catch {
      toast.error('Could not apply recommendation.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="bg-white/[0.02] border border-white/5 rounded-xl p-4 hover:bg-white/[0.04] transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-400">{recommendation.type.replace('_', ' ')}</p>
          <p className="mt-1 text-sm text-zinc-100 leading-relaxed">{recommendation.explanation}</p>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${priorityTone(recommendation.priority)}`}>
          {recommendation.priority}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          onClick={handleApply}
          disabled={isApplying}
          className="h-8 px-3 rounded-lg bg-white/10 border border-white/15 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-40 transition-colors"
        >
          {isApplying ? 'Applying...' : 'Accept'}
        </button>
      </div>
    </motion.article>
  );
};
