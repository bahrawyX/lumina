"use client";

import React, { useState, useCallback } from 'react';
import PomodoroView from '@/components/focus/PomodoroView';
import PomodoroFeedbackModal from '@/components/focus/PomodoroFeedbackModal';
import AchievementModal from '@/components/focus/AchievementModal';
import MoodAnalysisCard from '@/components/focus/MoodAnalysisCard';
import { LottieOverlay } from '@/components/ui/LottieOverlay';
import { useFocusSessionComplete } from '@/hooks/useFocusSessionComplete';
import * as moodPersistence from '@/lib/persistence/moodPersistence';
import { toast } from 'sonner';
import type { MoodValue, MoodLog } from '@/types';

export default function PomodoroPage() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [moodLogs, setMoodLogs] = useState<MoodLog[]>([]);
  const [moodLogsLoaded, setMoodLogsLoaded] = useState(false);

  /**
   * Shared with `/focus`. This page used to carry its own ~75-line copy of the
   * same handler, and the copy had lost the coin toast and the streak-milestone
   * overlay somewhere along the way — so finishing a session HERE earned coins
   * silently and let a 7-day streak pass without comment, while the same
   * session on `/focus` celebrated both.
   *
   * This is the route in the mobile bottom bar. `/focus` is in the More menu.
   * The degraded copy was the one most people were reaching.
   */
  const {
    handleSessionComplete,
    lastSessionId,
    showStreakFire,
    setShowStreakFire,
    achievementOpen,
    currentAchievement,
    handleAchievementDismiss,
  } = useFocusSessionComplete();

  React.useEffect(() => {
    if (moodLogsLoaded) return;
    moodPersistence.fetchMoodLogs(30).then((logs) => {
      setMoodLogs(logs);
      setMoodLogsLoaded(true);
    });
  }, [moodLogsLoaded]);

  const handleRequestFeedback = useCallback(() => {
    setFeedbackOpen(true);
  }, []);

  const handleFeedbackSubmit = useCallback(async (mood: MoodValue, note?: string) => {
    setFeedbackOpen(false);

    const result = await moodPersistence.logMood({
      focusSessionId: lastSessionId ?? undefined,
      mood,
      note,
    });

    if (result) {
      setMoodLogs((prev) => [{
        id: result.id,
        userId: '',
        focusSessionId: lastSessionId,
        mood,
        note,
        loggedAt: new Date().toISOString(),
      }, ...prev]);
    }

    if (mood === 'tired' || mood === 'bad') {
      toast('Take care of yourself. Short breaks help.', { duration: 4000 });
    }
  }, [lastSessionId]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Editorial header */}
      <div className="flex items-end justify-between gap-4 mb-4 md:mb-5 pb-4 md:pb-5 border-b border-border/60 flex-shrink-0">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 mb-1.5">
            Workspace · Focus
          </p>
          <h1 className="font-display text-2xl md:text-3xl font-medium text-foreground tracking-[-0.035em] leading-none">
            Pomodoro
          </h1>
          <p className="text-[11px] md:text-xs text-muted-foreground/80 mt-2 italic">
            Work in focused intervals, rest in between.
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <div className="w-full px-4 py-4 space-y-4">
          {moodLogsLoaded && moodLogs.length >= 3 && (
            <div className="max-w-lg mx-auto">
              <MoodAnalysisCard moodLogs={moodLogs} onDismiss={() => {}} />
            </div>
          )}
          <PomodoroView
            onSessionComplete={handleSessionComplete}
            onRequestFeedback={handleRequestFeedback}
          />
        </div>
      </div>

      <PomodoroFeedbackModal
        open={feedbackOpen}
        onSubmit={handleFeedbackSubmit}
      />

      <AchievementModal
        achievementType={currentAchievement}
        open={achievementOpen}
        onOpenChange={handleAchievementDismiss}
      />

      {/* The streak milestone overlay `/focus` had and this page did not. */}
      <LottieOverlay
        show={showStreakFire}
        path="/animations/streak-fire.json"
        duration={1500}
        size={180}
        onDone={() => setShowStreakFire(false)}
      />
    </div>
  );
}
