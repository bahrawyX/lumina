'use client';

import React, { useState, useCallback, useRef } from 'react';
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
import { useStreakStore } from '@/store/useStreakStore';
import { useFocusStore } from '@/store/useFocusStore';
import { useLinkStore } from '@/store/useLinkStore';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import * as moodPersistence from '@/lib/persistence/moodPersistence';
import { toast } from 'sonner';
import type { MoodValue, MoodLog, FocusSessionResult } from '@/types';
import { showCoinToast } from '@/lib/coins/showCoinToast';
import { useCoinsStore } from '@/store/useCoinsStore';
import { LottieOverlay } from '@/components/ui/LottieOverlay';

const STREAK_MILESTONES = new Set([3, 7, 14, 30]);
const SESSION_MILESTONES = new Set([5, 10]);

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
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [moodLogs, setMoodLogs] = useState<MoodLog[]>([]);
  const [moodLogsLoaded, setMoodLogsLoaded] = useState(false);
  const [achievementOpen, setAchievementOpen] = useState(false);
  const [showStreakFire, setShowStreakFire] = useState(false);
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
          plannedDurationSecs: data.plannedDurationSecs,
          taskId: data.taskId ?? null,
          taskTitle: data.taskTitle ?? null,
          timezone: userTimezone,
        }),
      });

      if (!res.ok) {
        // Surface the failure instead of silently swallowing it — the user
        // otherwise sees confetti with no balance change and no explanation.
        toast.error('Couldn\u2019t save this focus session. Your coins and streak are unchanged — please try again.');
        return;
      }

      const result: FocusSessionResult = await res.json();
      setLastSessionId(result.id);

      // Under-threshold sessions are saved for history only. No coins, no
      // streak bump, no confetti overlay — a neutral toast explains it.
      if (result.underThreshold) {
        toast('Session ended early \u2014 no coins earned this time.', { duration: 3500 });
        return;
      }

      applySessionResult(result);

      // Show coin earn toast
      if (result.coinsEarned > 0) {
        showCoinToast(result.coinsEarned, 'Focus session completed');
      }

      // The focus endpoint now awaits all coin awards and returns the
      // authoritative balance (applied above via setBalance in applySessionResult).
      // This refetch is a belt-and-braces reconcile against GET /api/coins — do
      // NOT optimistically add here or the balance diverges from the server.
      void useCoinsStore.getState().refetchBalance();

      // Streak milestone celebration overlay
      if (STREAK_MILESTONES.has(result.dailyStreak) || SESSION_MILESTONES.has(result.sessionStreak)) {
        setShowStreakFire(true);
      }

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
    } catch {
      toast.error('Couldn\u2019t save this focus session. Check your connection and try again.');
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
