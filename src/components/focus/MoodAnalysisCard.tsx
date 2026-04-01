'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MoodLog, MoodValue } from '@/types';
import { MOOD_ICONS, ChartIcon } from '@/components/ui/AnimatedIcons';

const MOOD_SCORES: Record<MoodValue, number> = {
  great: 5,
  good: 4,
  okay: 3,
  tired: 2,
  bad: 1,
};

const MOOD_LABELS: Record<MoodValue, string> = {
  great: 'great',
  good: 'good',
  okay: 'okay',
  tired: 'tired',
  bad: 'bad',
};

const STORAGE_KEY = 'lumina_last_mood_analysis';

interface MoodAnalysisCardProps {
  moodLogs: MoodLog[];
  onDismiss: () => void;
}

export default function MoodAnalysisCard({ moodLogs, onDismiss }: MoodAnalysisCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [reflection, setReflection] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Check if enough time has passed since last analysis
  const shouldShow = useMemo(() => {
    if (moodLogs.length < 3) return false;
    const last = localStorage.getItem(STORAGE_KEY);
    if (last) {
      const daysSince = (Date.now() - Number(last)) / (1000 * 60 * 60 * 24);
      if (daysSince < 3) return false;
    }
    return true;
  }, [moodLogs.length]);

  useEffect(() => {
    if (shouldShow) {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    }
  }, [shouldShow]);

  const analysis = useMemo(() => {
    if (!shouldShow) return null;

    // Take last 3 mood logs (already sorted newest first by API)
    const recent = moodLogs.slice(0, 3);
    const moods = recent.map((l) => l.mood as MoodValue);
    const scores = moods.map((m) => MOOD_SCORES[m] ?? 3);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Compare: the most recent (index 0) vs older ones (index 1-2)
    const recentScore = scores[0];
    const olderAvg = (scores[1] + scores[2]) / 2;
    const diff = recentScore - olderAvg;

    let trend: 'up' | 'down' | 'stable';
    if (diff >= 0.5) trend = 'up';
    else if (diff <= -0.5) trend = 'down';
    else trend = 'stable';

    const moodLabels = moods.map((m) => MOOD_LABELS[m]).join(', ');

    return { trend, avg, moods, moodLabels, showReflection: trend === 'down' || (trend === 'stable' && avg <= 2.5) };
  }, [shouldShow, moodLogs]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    onDismiss();
  }, [onDismiss]);

  if (!shouldShow || !analysis || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className="w-full bg-card border border-border rounded-2xl p-4 space-y-3"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <ChartIcon size={16} />
            <span className="text-sm font-semibold text-foreground">Your last 3 days</span>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Trend */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Mood trend:</span>
          <span className={`text-xs font-bold ${
            analysis.trend === 'up' ? 'text-green-500' : analysis.trend === 'down' ? 'text-destructive' : 'text-muted-foreground'
          }`}>
            {analysis.trend === 'up' && '↑ Getting better'}
            {analysis.trend === 'down' && '↓ Declining'}
            {analysis.trend === 'stable' && '→ Stable'}
          </span>
        </div>

        {/* Mood summary */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground leading-relaxed">
          <span>You logged</span>
          <span className="flex items-center gap-0.5">
            {analysis.moods.map((m, i) => {
              const Icon = MOOD_ICONS[m];
              return Icon ? <Icon key={i} size={16} /> : null;
            })}
          </span>
          <span>({analysis.moodLabels})</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{' '}
          {analysis.trend === 'up' && '— nice momentum!'}
          {analysis.trend === 'stable' && analysis.avg > 2.5 && '— consistent is good.'}
          {(analysis.trend === 'down' || (analysis.trend === 'stable' && analysis.avg <= 2.5)) && '— hang in there.'}
        </p>

        {/* Reflection input for declining/bad trends */}
        {analysis.showReflection && !submitted && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Seems like a tough stretch. What's making focus hard?
            </p>
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="Write a quick thought..."
              maxLength={200}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/40 resize-none"
            />
            <button
              type="button"
              onClick={() => {
                setSubmitted(true);
                handleDismiss();
              }}
              disabled={!reflection.trim()}
              className="text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-40 transition-colors"
            >
              Share
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
