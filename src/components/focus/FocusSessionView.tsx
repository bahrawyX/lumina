'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFocusStore } from '../../store/useFocusStore';
import { useTaskBoardStore } from '../../store/useTaskBoardStore';
import { FocusHeader } from './FocusHeader';
import { FocusTimer } from './FocusTimer';
import { MobileBottomSheet } from '../ui/MobileBottomSheet';

// ── Session history card ──────────────────────────────────────────────────────

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

// ── Completed / No-session views ──────────────────────────────────────────────

export const FocusDoneView: React.FC = () => {
  const sessionHistory = useFocusStore((s) => s.sessionHistory);
  const router = useRouter();
  const latest = sessionHistory[0];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-4 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-3xl">
          ✓
        </div>
        <h2 className="text-2xl font-semibold text-foreground">Session complete</h2>
        {latest && (
          <p className="text-sm text-muted-foreground">
            {latest.taskTitle} · {formatDuration(latest.duration)}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => router.push('/tasks')}
        className="px-6 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
      >
        Back to tasks
      </button>
    </div>
  );
};

// ── Main FocusSessionView ─────────────────────────────────────────────────────

export const FocusSessionView: React.FC = () => {
  const activeSession = useFocusStore((s) => s.activeSession);
  const timerState = useFocusStore((s) => s.timerState);
  const getElapsedSecs = useFocusStore((s) => s.getElapsedSecs);
  const cancelSession = useFocusStore((s) => s.cancelSession);
  const sessionHistory = useFocusStore((s) => s.sessionHistory);
  const updateTask = useTaskBoardStore((s) => s.updateTask);
  const router = useRouter();
  const [showInterruptionPrompt, setShowInterruptionPrompt] = React.useState(false);

  // No redirect — FocusSessionView is now embedded in the tabbed FocusPage.
  // When there's no active session, we show an empty state instead.

  const handleRequestInterruption = React.useCallback(() => {
    if (!activeSession) return;
    const remaining = Math.max(0, activeSession.totalDurationSecs - getElapsedSecs());
    if (timerState === 'running' && remaining > 0) {
      setShowInterruptionPrompt(true);
      return;
    }
    cancelSession();
    router.push('/tasks');
  }, [activeSession, getElapsedSecs, timerState, cancelSession, router]);

  const handleDoneAndExit = React.useCallback(() => {
    if (!activeSession) return;
    updateTask(activeSession.taskId, { status: 'done', remainingFocusTime: null });
    cancelSession();
    setShowInterruptionPrompt(false);
    router.push('/tasks');
  }, [activeSession, updateTask, cancelSession, router]);

  const handlePauseAndExit = React.useCallback(() => {
    if (!activeSession) return;
    const remaining = Math.max(0, Math.floor(activeSession.totalDurationSecs - getElapsedSecs()));
    updateTask(activeSession.taskId, {
      status: activeSession ? 'doing' : 'todo',
      remainingFocusTime: remaining,
    });
    cancelSession();
    setShowInterruptionPrompt(false);
    router.push('/tasks');
  }, [activeSession, getElapsedSecs, updateTask, cancelSession, router]);

  if (!activeSession) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-primary">
            <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">No active focus session</p>
          <p className="text-xs text-muted-foreground max-w-[260px]">
            Start a focus session from your task board, or use the Pomodoro timer.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full min-h-0 overflow-hidden">

      {/* Header */}
      <div className="relative z-10 flex-shrink-0 px-6 pt-5 pb-2">
        <FocusHeader taskTitle={activeSession.taskTitle} onAttemptClose={handleRequestInterruption} />
      </div>

      {/* Timer — centered */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4">
        <FocusTimer onRequestInterruption={handleRequestInterruption} />
      </div>

      {/* Session history */}
      {sessionHistory.length > 0 && (
        <div className="relative z-10 flex-shrink-0 px-6 pb-6">
          <div className="mx-auto max-w-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/40 mb-2.5">
              Recent sessions
            </p>
            <div className="space-y-1 max-h-36 overflow-y-auto no-scrollbar">
              {sessionHistory.slice(0, 5).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/30 border border-border/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-foreground/80 truncate">{s.taskTitle}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">{formatDate(s.startTime)}</p>
                  </div>
                  <div className="ml-3 flex items-center gap-2 flex-shrink-0">
                    <span className="text-[11px] font-semibold tabular-nums text-muted-foreground/70">
                      {formatDuration(s.duration)}
                    </span>
                    <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md ${
                      s.completed
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-muted text-muted-foreground/40'
                    }`}>
                      {s.completed ? 'Done' : 'Partial'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <MobileBottomSheet
        open={showInterruptionPrompt}
        onClose={() => setShowInterruptionPrompt(false)}
        title="Focus session paused"
        className="md:max-w-md"
      >
        <div className="space-y-5">
          <div>
            <h3 className="text-base font-semibold text-foreground">Focus session paused. Did you finish this task?</h3>
            <p className="mt-1 text-sm text-muted-foreground">If not, we will save your remaining timer so you can resume later.</p>
          </div>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={handleDoneAndExit}
              className="min-h-11 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-500/90 transition-colors"
            >
              Yes, it's done
            </button>
            <button
              type="button"
              onClick={handlePauseAndExit}
              className="min-h-11 rounded-xl border border-border/60 bg-muted/30 text-foreground text-sm font-semibold hover:bg-muted/50 transition-colors"
            >
              Not yet
            </button>
          </div>
        </div>
      </MobileBottomSheet>
    </div>
  );
};
