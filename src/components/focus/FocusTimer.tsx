'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useFocusStore } from '../../store/useFocusStore';
import { useTaskBoardStore } from '../../store/useTaskBoardStore';
import { FocusProgress } from './FocusProgress';

// ── Icons ─────────────────────────────────────────────────────────────────────

const PauseIcon: React.FC = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

const PlayIcon: React.FC = () => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const CheckIcon: React.FC = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSecs(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

// ── FocusTimer ────────────────────────────────────────────────────────────────

/**
 * Timer display is driven by a local setInterval that calls getElapsedSecs()
 * (a pure computation on refs) — so ticking does NOT cause store or app rerenders.
 * Only the FocusTimer component itself re-renders every second.
 */
export const FocusTimer: React.FC = () => {
  const timerState = useFocusStore((s) => s.timerState);
  const activeSession = useFocusStore((s) => s.activeSession);
  const pauseSession = useFocusStore((s) => s.pauseSession);
  const resumeSession = useFocusStore((s) => s.resumeSession);
  const finishSession = useFocusStore((s) => s.finishSession);
  const getElapsedSecs = useFocusStore((s) => s.getElapsedSecs);
  const updateTask = useTaskBoardStore((s) => s.updateTask);
  const router = useRouter();

  // Local display state — only this component re-renders every second
  const [displaySecs, setDisplaySecs] = useState(() => getElapsedSecs());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didAutoFinish = useRef(false);

  const totalSecs = activeSession?.totalDurationSecs ?? 25 * 60;
  const remainingSecs = Math.max(0, totalSecs - displaySecs);
  const progress = Math.min(1, displaySecs / totalSecs);

  const showCompletionToast = useCallback((taskId: string, taskTitle: string) => {
    toast.success(`"${taskTitle}" session complete!`, {
      description: 'Mark the task as done or keep it in Doing.',
      duration: 10000,
      action: {
        label: 'Mark as Done',
        onClick: () => updateTask(taskId, { status: 'done' }),
      },
    });
  }, [updateTask]);

  const tick = useCallback(() => {
    const elapsed = getElapsedSecs();
    setDisplaySecs(elapsed);
    if (elapsed >= totalSecs && !didAutoFinish.current) {
      didAutoFinish.current = true;
      const taskId = useFocusStore.getState().activeSession?.taskId ?? '';
      const taskTitle = useFocusStore.getState().activeSession?.taskTitle ?? '';
      finishSession();
      showCompletionToast(taskId, taskTitle);
      router.push('/tasks');
    }
  }, [getElapsedSecs, totalSecs, finishSession, showCompletionToast, router]);

  // Start/stop interval based on timerState — no global rerender side-effects
  useEffect(() => {
    if (timerState === 'running') {
      intervalRef.current = setInterval(tick, 1000);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      setDisplaySecs(getElapsedSecs());
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timerState, tick, getElapsedSecs]);

  const handleFinish = () => {
    const taskId = activeSession?.taskId ?? '';
    const taskTitle = activeSession?.taskTitle ?? '';
    finishSession();
    showCompletionToast(taskId, taskTitle);
    router.push('/tasks');
  };

  return (
    <div className="flex flex-col items-center gap-10">
      {/* Ring + countdown */}
      <div className="relative flex items-center justify-center">
        <FocusProgress progress={progress} size={280} strokeWidth={4} />
        {/* Subtle glow behind ring when running */}
        {timerState === 'running' && (
          <div className="absolute w-40 h-40 rounded-full bg-primary/8 blur-2xl pointer-events-none" />
        )}
        <div className="absolute flex flex-col items-center gap-2 select-none">
          <span className="font-mono text-[52px] font-extralight tracking-tight text-foreground tabular-nums leading-none">
            {formatSecs(remainingSecs)}
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
            timerState === 'paused' ? 'text-amber-500/80' : 'text-primary/60'
          }`}>
            {timerState === 'paused' ? 'Paused' : 'Flowing'}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-5">
        {/* Pause / Resume */}
        <button
          type="button"
          onClick={timerState === 'running' ? pauseSession : resumeSession}
          className="flex items-center justify-center w-12 h-12 rounded-2xl border border-border/50 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
          aria-label={timerState === 'running' ? 'Pause' : 'Resume'}
        >
          {timerState === 'running' ? <PauseIcon /> : <PlayIcon />}
        </button>

        {/* Finish */}
        <button
          type="button"
          onClick={handleFinish}
          className="flex items-center gap-2 px-7 h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.97] transition-all shadow-lg shadow-primary/20"
        >
          <CheckIcon />
          Finish session
        </button>
      </div>

      {/* Progress bar */}
      <div className="w-48 flex flex-col items-center gap-2">
        <div className="w-full h-[3px] rounded-full bg-border/40 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground/40">
          {Math.round(progress * 100)}% · {formatSecs(displaySecs)} elapsed
        </span>
      </div>
    </div>
  );
};
