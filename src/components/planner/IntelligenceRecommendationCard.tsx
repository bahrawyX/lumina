'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import type { Recommendation } from '@/lib/intelligence/types';
import { useIntelligenceStore } from '@/store/useIntelligenceStore';
import { useTaskBoardStore } from '@/store/useTaskBoardStore';

// ── Explanation humanizer ────────────────────────────────────────────────────

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_RE  = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

function fmtIso(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

function humanize(text: string, tasks: { id: string; title: string }[]): string {
  // Replace raw UUIDs with the task title (quoted), or shorten unknown ones
  let out = text.replace(UUID_RE, (id) => {
    const task = tasks.find((t) => t.id === id);
    return task ? `"${task.title}"` : id.slice(0, 8) + '…';
  });
  // Replace ISO timestamps with a readable local time
  out = out.replace(ISO_RE, fmtIso);
  return out;
}

interface IntelligenceRecommendationCardProps {
  recommendation: Recommendation;
  plannedTaskIds?: Set<string>;
}

function priorityTone(priority: Recommendation['priority']): string {
  if (priority === 'high') return 'text-rose-300 border-rose-400/25 bg-rose-500/10';
  if (priority === 'medium') return 'text-amber-300 border-amber-400/25 bg-amber-500/10';
  return 'text-emerald-300 border-emerald-400/25 bg-emerald-500/10';
}

function acceptLabel(type: Recommendation['type']): string {
  if (type === 'conflict') return 'Resolve Conflict';
  if (type === 'overload') return 'Defer Tasks';
  if (type === 'focus_window') return 'Protect Window';
  if (type === 'task_plan') return 'Schedule Task';
  return 'Accept';
}

export const IntelligenceRecommendationCard: React.FC<IntelligenceRecommendationCardProps> = ({ recommendation, plannedTaskIds }) => {
  const applyRecommendation = useIntelligenceStore((s) => s.applyRecommendation);
  const tasks = useTaskBoardStore((s) => s.tasks);
  const [isApplying, setIsApplying] = React.useState(false);
  const explanation = humanize(recommendation.explanation, tasks);

  // Check if this task_plan recommendation is for an already-planned task
  const isAlreadyPlanned = recommendation.type === 'task_plan'
    && plannedTaskIds
    && recommendation.relatedIds?.some((id) => plannedTaskIds.has(id));

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
      className="bg-muted/30 border border-border/40 rounded-xl p-4 hover:bg-muted/50 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{recommendation.type.replace('_', ' ')}</p>
          <p className="mt-1 text-sm text-foreground leading-relaxed">{explanation}</p>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${priorityTone(recommendation.priority)}`}>
          {recommendation.priority}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-end">
        {isAlreadyPlanned ? (
          <span className="bg-primary/10 text-primary text-xs rounded-full px-2 py-0.5">
            Already planned ✓
          </span>
        ) : (
          <button
            type="button"
            onClick={handleApply}
            disabled={isApplying}
            className="h-8 px-3 rounded-lg bg-primary/10 border border-primary/30 text-xs font-semibold text-primary hover:bg-primary/15 disabled:opacity-40 transition-colors"
          >
            {isApplying ? 'Applying...' : acceptLabel(recommendation.type)}
          </button>
        )}
      </div>
    </motion.article>
  );
};
