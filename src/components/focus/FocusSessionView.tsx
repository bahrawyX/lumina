'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFocusStore } from '../../store/useFocusStore';
import { FocusHeader } from './FocusHeader';
import { FocusTimer } from './FocusTimer';

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
  const sessionHistory = useFocusStore((s) => s.sessionHistory);
  const router = useRouter();

  useEffect(() => {
    if (!activeSession) {
      router.replace('/tasks');
    }
  }, [activeSession, router]);

  if (!activeSession) return null;

  return (
    <div className="relative flex flex-col h-full min-h-0 overflow-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] -translate-y-16" />
      </div>

      {/* Header */}
      <div className="relative z-10 flex-shrink-0 px-6 pt-5 pb-2">
        <FocusHeader taskTitle={activeSession.taskTitle} />
      </div>

      {/* Timer — centered */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4">
        <FocusTimer />
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
    </div>
  );
};
