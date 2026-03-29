'use client';

import React, { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FocusSessionView } from '@/components/focus/FocusSessionView';
import PomodoroView from '@/components/focus/PomodoroView';
import StopwatchView from '@/components/focus/StopwatchView';
import PomodoroFeedbackModal from '@/components/focus/PomodoroFeedbackModal';
import MoodAnalysisCard from '@/components/focus/MoodAnalysisCard';
import { useStreakStore } from '@/store/useStreakStore';
import { useFocusStore } from '@/store/useFocusStore';
import * as moodPersistence from '@/lib/persistence/moodPersistence';
import { toast } from 'sonner';
import { getAchievementInfo } from '@/utils/streaks/achievementUtils';
import type { MoodValue, MoodLog, FocusSessionResult } from '@/types';

const FocusPage: React.FC = () => {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [moodLogs, setMoodLogs] = useState<MoodLog[]>([]);
  const [moodLogsLoaded, setMoodLogsLoaded] = useState(false);

  const applySessionResult = useStreakStore((s) => s.applySessionResult);

  // Load mood logs once
  React.useEffect(() => {
    if (moodLogsLoaded) return;
    moodPersistence.fetchMoodLogs(30).then((logs) => {
      setMoodLogs(logs);
      setMoodLogsLoaded(true);
    });
  }, [moodLogsLoaded]);

  const handleSessionComplete = useCallback(async (data: { startTime: string; endTime: string; duration: number }) => {
    try {
      const res = await fetch('/api/focus-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: data.startTime,
          endTime: data.endTime,
          duration: data.duration,
          taskId: null,
        }),
      });

      if (res.ok) {
        const result: FocusSessionResult = await res.json();
        setLastSessionId(result.id);
        applySessionResult(result);

        // Show achievement toasts
        for (const ach of result.newAchievements) {
          const info = getAchievementInfo(ach.type);
          if (info) {
            toast(`${info.emoji} ${info.message}`, { duration: 5000 });
          }
        }

        // Add to focus store session history
        const session = {
          id: result.id,
          taskId: '',
          taskTitle: '',
          startTime: data.startTime,
          endTime: data.endTime,
          duration: data.duration,
          completed: true,
        };
        useFocusStore.getState().sessionHistory.push(session);
      }
    } catch {
      // Fire-and-forget
    }
  }, [applySessionResult]);

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
      <Tabs defaultValue="focus" className="flex flex-col h-full" data-tutorial="focus-tabs">
        <div className="px-2 lg:px-4 pt-1 pb-3">
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
        <TabsContent value="focus" forceMount className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
          <FocusSessionView />
        </TabsContent>

        <TabsContent value="pomodoro" forceMount className="flex-1 min-h-0 mt-0 overflow-y-auto data-[state=inactive]:hidden">
          <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
            {moodLogsLoaded && moodLogs.length >= 3 && (
              <MoodAnalysisCard moodLogs={moodLogs} onDismiss={() => {}} />
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
    </div>
  );
};

export default FocusPage;
