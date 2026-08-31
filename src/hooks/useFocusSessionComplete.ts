'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useStreakStore } from '@/store/useStreakStore';
import { useLinkStore } from '@/store/useLinkStore';
import { useCoinsStore } from '@/store/useCoinsStore';
import { useFocusStore } from '@/store/useFocusStore';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { showCoinToast } from '@/lib/coins/showCoinToast';
import type { FocusSessionResult } from '@/types';
import type { PomodoroSessionData } from '@/components/pages/FocusPage';

/**
 * What happens when a focus session finishes.
 *
 * This existed twice — once in `FocusPage` (`/focus`) and once in
 * `app/(app)/pomodoro/page.tsx` (`/pomodoro`) — as two near-identical copies
 * of the same ~90 lines. They had drifted, and drifted in the worse direction:
 * the copy on `/pomodoro` was missing
 *
 *   - the coin toast, so a session there earned coins and never said so; and
 *   - the streak-milestone celebration, so hitting a 3/7/14/30-day streak
 *     passed in silence.
 *
 * `/pomodoro` is the route in the mobile bottom bar, labelled "Focus".
 * `/focus` — the copy that had both — is buried in the More menu as "Focus
 * Timer". So the version most people actually reach was the degraded one.
 *
 * Two copies of a reward path is a bug generator, not just duplication. One
 * hook, both pages.
 */

/** Daily-streak lengths worth celebrating on screen. */
const STREAK_MILESTONES = new Set([3, 7, 14, 30]);
/** Consecutive-session counts worth the same. */
const SESSION_MILESTONES = new Set([5, 10]);

export interface UseFocusSessionComplete {
  /** Hand this to a timer view's `onSessionComplete`. */
  handleSessionComplete: (data: PomodoroSessionData) => Promise<void>;
  /** Id of the session just saved, for attaching a mood log to it. */
  lastSessionId: string | null;
  /** Drives the streak-fire overlay. */
  showStreakFire: boolean;
  setShowStreakFire: (show: boolean) => void;
  achievementOpen: boolean;
  currentAchievement: string | null;
  /** Pass to the achievement modal's `onOpenChange` — walks the queue. */
  handleAchievementDismiss: (open: boolean) => void;
}

export function useFocusSessionComplete(): UseFocusSessionComplete {
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [showStreakFire, setShowStreakFire] = useState(false);
  const [achievementOpen, setAchievementOpen] = useState(false);
  const [currentAchievement, setCurrentAchievement] = useState<string | null>(null);
  const achievementQueueRef = useRef<string[]>([]);

  const applySessionResult = useStreakStore((s) => s.applySessionResult);
  const promptTaskCompletion = useLinkStore((s) => s.promptTaskCompletion);
  const userTimezone =
    useOnboardingStore((s) => s.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const handleSessionComplete = useCallback(
    async (data: PomodoroSessionData) => {
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
          toast.error(
            'Couldn’t save this focus session. Your coins and streak are unchanged — please try again.',
          );
          return;
        }

        const result: FocusSessionResult = await res.json();
        setLastSessionId(result.id);

        // Under-threshold sessions are saved for history only. No coins, no
        // streak bump, no confetti overlay — a neutral toast explains it.
        if (result.underThreshold) {
          toast('Session ended early — no coins earned this time.', { duration: 3500 });
          return;
        }

        applySessionResult(result);

        if (result.coinsEarned > 0) {
          showCoinToast(result.coinsEarned, 'Focus session completed');
        }

        // The focus endpoint awaits all coin awards and returns the
        // authoritative balance (applied above via setBalance in
        // applySessionResult). This refetch is a belt-and-braces reconcile
        // against GET /api/coins — do NOT optimistically add here or the
        // balance diverges from the server.
        void useCoinsStore.getState().refetchBalance();

        if (
          STREAK_MILESTONES.has(result.dailyStreak) ||
          SESSION_MILESTONES.has(result.sessionStreak)
        ) {
          setShowStreakFire(true);
        }

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

        // Only worth a push if they are not looking at the tab.
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

        if (data.taskId && data.taskTitle) {
          promptTaskCompletion(data.taskId, data.taskTitle);
        }
      } catch {
        toast.error('Couldn’t save this focus session. Check your connection and try again.');
      }
    },
    [applySessionResult, promptTaskCompletion, userTimezone],
  );

  const handleAchievementDismiss = useCallback((open: boolean) => {
    if (open) return;
    achievementQueueRef.current.shift();
    if (achievementQueueRef.current.length > 0) {
      setCurrentAchievement(achievementQueueRef.current[0]);
    } else {
      setAchievementOpen(false);
      setCurrentAchievement(null);
    }
  }, []);

  return {
    handleSessionComplete,
    lastSessionId,
    showStreakFire,
    setShowStreakFire,
    achievementOpen,
    currentAchievement,
    handleAchievementDismiss,
  };
}
