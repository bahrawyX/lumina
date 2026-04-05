"use client";

import React, { useState, useCallback } from 'react';
import PomodoroView from '@/components/focus/PomodoroView';
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
import type { PomodoroSessionData } from '@/components/pages/FocusPage';

export default function PomodoroPage() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [moodLogs, setMoodLogs] = useState<MoodLog[]>([]);
  const [moodLogsLoaded, setMoodLogsLoaded] = useState(false);
  const [achievementOpen, setAchievementOpen] = useState(false);
  const [currentAchievement, setCurrentAchievement] = useState<string | null>(null);
  const achievementQueueRef = React.useRef<string[]>([]);

  const applySessionResult = useStreakStore((s) => s.applySessionResult);
  const promptTaskCompletion = useLinkStore((s) => s.promptTaskCompletion);
  const userTimezone = useOnboardingStore((s) => s.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone;

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

        if (result.newAchievements.length > 0) {
          achievementQueueRef.current = result.newAchievements.map((a) => a.type);
          setCurrentAchievement(achievementQueueRef.current[0]);
          setAchievementOpen(true);
        }

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
    <div className="flex flex-col h-full overflow-y-auto">
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
}
