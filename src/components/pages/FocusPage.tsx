'use client';

import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Route-scoped preload for the streak-fire + pomodoro-complete Lotties used on /focus.
// Replaces the global preload in app/layout (see Bug #4).
if (typeof window !== 'undefined') {
  ReactDOM.preload('/animations/streak-fire.json', { as: 'fetch', crossOrigin: 'anonymous' });
  ReactDOM.preload('/animations/pomodoro-complete.json', { as: 'fetch', crossOrigin: 'anonymous' });
}
import { FocusSessionView } from '@/components/focus/FocusSessionView';
import PomodoroView from '@/components/focus/PomodoroView';
import StopwatchView from '@/components/focus/StopwatchView';
import PomodoroFeedbackModal from '@/components/focus/PomodoroFeedbackModal';
import AchievementModal from '@/components/focus/AchievementModal';
import MoodAnalysisCard from '@/components/focus/MoodAnalysisCard';
import * as moodPersistence from '@/lib/persistence/moodPersistence';
import { toast } from 'sonner';
import type { MoodValue, MoodLog } from '@/types';
import { useFocusSessionComplete } from '@/hooks/useFocusSessionComplete';
import { LottieOverlay } from '@/components/ui/LottieOverlay';

export interface PomodoroSessionData {
  startTime: string;
  endTime: string;
  /** Seconds the user actually worked (minutes for coin calc server-side). */
  duration: number;
  /** Intended session length in seconds. Server uses this to enforce the 75% completion gate. */
  plannedDurationSecs?: number;
  taskId?: string;
  taskTitle?: string;
}

const FocusPage: React.FC = () => {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [moodLogs, setMoodLogs] = useState<MoodLog[]>([]);
  const [moodLogsLoaded, setMoodLogsLoaded] = useState(false);

  /**
   * Shared with `/pomodoro`, which used to carry its own copy of this and had
   * quietly lost the coin toast and the streak-milestone overlay from it.
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

  // Load mood logs once
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
      {/* Streak milestone celebration */}
      <LottieOverlay
        show={showStreakFire}
        path="/animations/streak-fire.json"
        duration={1500}
        size={180}
        onDone={() => setShowStreakFire(false)}
      />

      {/* Editorial header */}
      <div className="flex items-end justify-between gap-4 mb-4 md:mb-5 pb-4 md:pb-5 border-b border-border/60 flex-shrink-0">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 mb-1.5">
            Workspace · Focus
          </p>
          <h1 className="font-display text-2xl md:text-3xl font-medium text-foreground tracking-[-0.035em] leading-none">
            Focus
          </h1>
          <p className="text-[11px] md:text-xs text-muted-foreground/80 mt-2 italic">
            Deep work, timed and tracked.
          </p>
        </div>
      </div>

      <Tabs defaultValue="focus" className="flex flex-col flex-1 min-h-0" data-tutorial="focus-tabs">
        <div className="px-2 lg:px-4 pb-3 flex-shrink-0">
          <TabsList className="bg-muted/30 border border-border/60 p-0.5 rounded-lg h-auto">
            <TabsTrigger
              value="focus"
              className="text-sm py-1.5 px-4 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              Focus Timer
            </TabsTrigger>
            <TabsTrigger
              value="pomodoro"
              className="text-sm py-1.5 px-4 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              Pomodoro
            </TabsTrigger>
            <TabsTrigger
              value="stopwatch"
              className="text-sm py-1.5 px-4 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              Stopwatch
            </TabsTrigger>
          </TabsList>
        </div>

        {/* forceMount keeps timers alive across tab switches; hidden via data-[state=inactive] */}
        <TabsContent value="focus" forceMount className="flex-1 min-h-0 mt-0 overflow-y-auto data-[state=inactive]:hidden">
          <FocusSessionView />
        </TabsContent>

        <TabsContent value="pomodoro" forceMount className="flex-1 min-h-0 mt-0 overflow-y-auto data-[state=inactive]:hidden">
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
        </TabsContent>

        <TabsContent value="stopwatch" forceMount className="flex-1 min-h-0 mt-0 overflow-y-auto data-[state=inactive]:hidden">
          <div className="max-w-lg mx-auto px-4 py-8">
            <StopwatchView />
          </div>
        </TabsContent>
      </Tabs>

      <PomodoroFeedbackModal
        open={feedbackOpen}
        onSubmit={handleFeedbackSubmit}
      />

      <AchievementModal
        achievementType={currentAchievement}
        open={achievementOpen}
        onOpenChange={handleAchievementDismiss}
      />
    </div>
  );
};

export default FocusPage;
