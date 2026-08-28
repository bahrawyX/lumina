'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useFocusStore } from '../../store/useFocusStore';
import { useTaskBoardStore } from '../../store/useTaskBoardStore';
import { FocusProgress } from './FocusProgress';
import { CheckIcon } from '@/components/icons/CheckIcons';

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

function formatSecs(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

interface FocusTimerProps {
  onRequestInterruption: () => void;
}

export const FocusTimer: React.FC<FocusTimerProps> = ({ onRequestInterruption }) => {
  const timerState = useFocusStore((s) => s.timerState);
  const activeSession = useFocusStore((s) => s.activeSession);
  const resumeSession = useFocusStore((s) => s.resumeSession);
  const finishSession = useFocusStore((s) => s.finishSession);
  const getElapsedSecs = useFocusStore((s) => s.getElapsedSecs);
  const updateTask = useTaskBoardStore((s) => s.updateTask);
  const router = useRouter();

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
        onClick: () => updateTask(taskId, { status: 'done', remainingFocusTime: null }),
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
      if (taskId) {
        updateTask(taskId, { remainingFocusTime: null });
      }
      showCompletionToast(taskId, taskTitle);
      router.push('/tasks');
    }
  }, [getElapsedSecs, totalSecs, finishSession, showCompletionToast, router, updateTask]);

  useEffect(() => {
    if (timerState === 'running') {
      intervalRef.current = setInterval(tick, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setDisplaySecs(getElapsedSecs());
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerState, tick, getElapsedSecs]);

  const handleFinish = () => {
    const taskId = activeSession?.taskId ?? '';
    const taskTitle = activeSession?.taskTitle ?? '';
    finishSession();
    if (taskId) {
      updateTask(taskId, { remainingFocusTime: null });
    }
    showCompletionToast(taskId, taskTitle);
    router.push('/tasks');
  };

  return (
    <div className="flex flex-col items-center gap-10">
      <div className="relative flex items-center justify-center">
        <FocusProgress progress={progress} size={280} strokeWidth={4} />
        <div className="absolute flex flex-col items-center gap-2 select-none">
          <span className="font-mono text-[52px] font-extralight tracking-tight text-foreground tabular-nums leading-none">
            {formatSecs(remainingSecs)}
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
            timerState === 'paused' ? 'text-amber-500/80' : 'text-primary/60'
          }`}>
            {timerState === 'paused' ? 'Paused' : 'Running'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={timerState === 'running' ? onRequestInterruption : resumeSession}
          className="flex items-center justify-center w-12 h-12 rounded-xl border border-border/50 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
          aria-label={timerState === 'running' ? 'Pause' : 'Resume'}
        >
          {timerState === 'running' ? <PauseIcon /> : <PlayIcon />}
        </button>

        <button
          type="button"
          onClick={handleFinish}
          className="flex items-center gap-2 px-7 h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.97] transition-all"
        >
          <CheckIcon size={18} strokeWidth={2.5} />
          Finish session
        </button>
      </div>

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
