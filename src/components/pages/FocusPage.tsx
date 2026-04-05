'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FocusSessionView } from '@/components/focus/FocusSessionView';
import PomodoroView from '@/components/focus/PomodoroView';
import StopwatchView from '@/components/focus/StopwatchView';
import PomodoroFeedbackModal from '@/components/focus/PomodoroFeedbackModal';
import AchievementModal from '@/components/focus/AchievementModal';
import MoodAnalysisCard from '@/components/focus/MoodAnalysisCard';
import { useStreakStore } from '@/store/useStreakStore';
import { useFocusStore } from '@/store/useFocusStore';
import { useLinkStore } from '@/store/useLinkStore';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import * as moodPersistence from '@/lib/persistence/moodPersistence';
import { toast } from 'sonner';
import type { MoodValue, MoodLog, FocusSessionResult } from '@/types';

export interface PomodoroSessionData {
  startTime: string;
  endTime: string;
  duration: number;
  taskId?: string;
  taskTitle?: string;
}

const FocusPage: React.FC = () => {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [moodLogs, setMoodLogs] = useState<MoodLog[]>([]);
  const [moodLogsLoaded, setMoodLogsLoaded] = useState(false);
  const [achievementOpen, setAchievementOpen] = useState(false);
  const [currentAchievement, setCurrentAchievement] = useState<string | null>(null);
  const achievementQueueRef = useRef<string[]>([]);

  const applySessionResult = useStreakStore((s) => s.applySessionResult);
  const promptTaskCompletion = useLinkStore((s) => s.promptTaskCompletion);
  const userTimezone = useOnboardingStore((s) => s.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Load mood logs once
  React.useEffect(() => {
    if (moodLogsLoaded) return;
    moodPersistence.fetchMoodLogs(30).then((logs) => {
      setMoodLogs(logs);
      setMoodLogsLoaded(true);
    });
  }, [moodLogsLoaded]);

  const handleSessionComplete = useCallback(async (data: PomodoroSessionData) => {
    try {
      const res = await fetch('/api/focus-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: data.startTime,
          endTime: data.endTime,
          duration: data.duration,
          taskId: data.taskId ?? null,
          taskTitle: data.taskTitle ?? null,
          timezone: userTimezone,
        }),
      });

      if (res.ok) {
        const result: FocusSessionResult = await res.json();
        setLastSessionId(result.id);
        applySessionResult(result);

        // Queue achievement modals
        if (result.newAchievements.length > 0) {
          achievementQueueRef.current = result.newAchievements.map((a) => a.type);
          setCurrentAchievement(achievementQueueRef.current[0]);
          setAchievementOpen(true);
        }

        // Add to focus store session history (with task info)
        const session = {
          id: result.id,
          taskId: data.taskId ?? '',
          taskTitle: data.taskTitle ?? '',
          startTime: data.startTime,
          endTime: data.endTime,
          duration: data.duration,
          completed: true,
        };
        useFocusStore.getState().sessionHistory.unshift(session);

        // Send push notification if tab is in background
        if (document.hidden) {
          const mins = Math.round(data.duration / 60);
          fetch('/api/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: 'Focus session complete',
              body: `${mins} min session${data.taskTitle ? ` · ${data.taskTitle}` : ''} finished`,
              tag: 'focus-complete',
              url: '/focus',
              notificationType: 'focus_complete',
            }),
          }).catch(() => { /* fire-and-forget */ });
        }

        // Prompt task completion if a task was linked
        if (data.taskId && data.taskTitle) {
          promptTaskCompletion(data.taskId, data.taskTitle);
        }
      }
    } catch {
      // Fire-and-forget
    }
  }, [applySessionResult, promptTaskCompletion, userTimezone]);

  const handleAchievementDismiss = useCallback((open: boolean) => {
    if (!open) {
      achievementQueueRef.current.shift();
      if (achievementQueueRef.current.length > 0) {
        setCurrentAchievement(achievementQueueRef.current[0]);
      } else {
        setAchievementOpen(false);
        setCurrentAchievement(null);
      }
    }
  }, []);

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
