'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/store/useSettingsStore';
import { usePomodoroStore } from '@/store/usePomodoroStore';
import { LottieAnimation, POMODORO_COMPLETE_LAYER_MAP } from '@/components/ui/LottieAnimation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ── Types ────────────────────────────────────────────────────────────────────

interface PomodoroViewProps {
  onSessionComplete: (data: { startTime: string; endTime: string; duration: number }) => void;
  onRequestFeedback: (focusSessionId: string | null) => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SESSIONS_OPTIONS = [2, 3, 4, 5, 6, 7, 8];
const RING_SIZE = 220;
const RING_STROKE = 6;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function playChime(): void {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const frequencies = [523.25, 659.25];
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0, now + i * 0.2);
      gain.gain.linearRampToValueAtTime(0.3, now + i * 0.2 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.2);
      osc.stop(now + i * 0.2 + 0.6);
    });
    setTimeout(() => ctx.close().catch(() => {}), 2000);
  } catch { /* silent */ }
}

// ── SVG Icons ────────────────────────────────────────────────────────────────

const PlayIcon: React.FC = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const PauseIcon: React.FC = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

const SkipIcon: React.FC = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 4 15 12 5 20 5 4" />
    <rect x="17" y="4" width="3" height="16" rx="1" />
  </svg>
);

const TimerIcon: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <motion.svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    animate={{ scale: [1, 1.04, 1] }}
    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
  >
    <circle cx="12" cy="13" r="8" stroke="hsl(var(--primary))" strokeWidth={1.5} fill="none" />
    <circle cx="12" cy="13" r="6.5" stroke="hsl(var(--primary))" strokeWidth={0.5} opacity={0.2} fill="none" />
    <line x1="12" y1="13" x2="12" y2="9" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeLinecap="round" />
    <line x1="12" y1="13" x2="15" y2="13" stroke="hsl(var(--primary))" strokeWidth={1.2} strokeLinecap="round" opacity={0.7} />
    <line x1="10" y1="3" x2="14" y2="3" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeLinecap="round" />
    <line x1="12" y1="3" x2="12" y2="5" stroke="hsl(var(--primary))" strokeWidth={1.2} strokeLinecap="round" />
  </motion.svg>
);

const CoffeeIcon: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="4" y="10" width="12" height="10" rx="2" fill="hsl(var(--muted-foreground))" opacity={0.25} />
    <rect x="5" y="11" width="10" height="8" rx="1.5" fill="hsl(var(--muted-foreground))" opacity={0.15} />
    <path d="M16 12h2a2 2 0 0 1 0 4h-2" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} opacity={0.3} />
    <motion.path
      d="M8 8c0-2 1-3 0-4"
      stroke="hsl(var(--muted-foreground))"
      strokeWidth={1.2}
      strokeLinecap="round"
      opacity={0.4}
      animate={{ y: [0, -1.5, 0], opacity: [0.4, 0.2, 0.4] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
    />
    <motion.path
      d="M11 8c0-2 1-3 0-4"
      stroke="hsl(var(--muted-foreground))"
      strokeWidth={1.2}
      strokeLinecap="round"
      opacity={0.3}
      animate={{ y: [0, -1.5, 0], opacity: [0.3, 0.15, 0.3] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
    />
  </svg>
);

const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// ── Progress Ring ────────────────────────────────────────────────────────────

interface ProgressRingProps {
  progress: number;
  size: number;
  strokeWidth: number;
}

const ProgressRing: React.FC<ProgressRingProps> = ({ progress, size, strokeWidth }) => {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - Math.min(1, Math.max(0, progress)));
  const cx = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)' }}
      aria-hidden
    >
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth} opacity={0.5} />
      <circle
        cx={cx} cy={cx} r={r} fill="none"
        stroke="hsl(var(--primary))" strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={dashOffset}
        style={{ transition: 'stroke-dashoffset 1s linear' }}
      />
    </svg>
  );
};

// ── Session Dots ─────────────────────────────────────────────────────────────

const SessionDots: React.FC<{ completed: number; total: number }> = ({ completed, total }) => (
  <div className="flex items-center gap-2">
    {Array.from({ length: total }, (_, i) => (
      <motion.div
        key={i}
        className={`w-2.5 h-2.5 rounded-full transition-colors ${i < completed ? 'bg-primary' : 'bg-muted'}`}
        initial={false}
        animate={i < completed ? { scale: [1, 1.3, 1] } : {}}
        transition={{ duration: 0.3 }}
      />
    ))}
  </div>
);

// ── Main Component ───────────────────────────────────────────────────────────

const PomodoroView: React.FC<PomodoroViewProps> = ({ onSessionComplete, onRequestFeedback }) => {
  const focusSessionLength = useSettingsStore((s) => s.focusSessionLength);

  // ── Store state ────────────────────────────────────────────────────────────
  const phase = usePomodoroStore((s) => s.phase);
  const isRunning = usePomodoroStore((s) => s.isRunning);
  const isPaused = usePomodoroStore((s) => s.isPaused);
  const sessionCount = usePomodoroStore((s) => s.sessionCount);
  const workMins = usePomodoroStore((s) => s.workMins);
  const shortBreakMins = usePomodoroStore((s) => s.shortBreakMins);
  const longBreakMins = usePomodoroStore((s) => s.longBreakMins);
  const sessionsPerCycle = usePomodoroStore((s) => s.sessionsPerCycle);
  const showCelebration = usePomodoroStore((s) => s.showCelebration);
  const workSessionStartedAt = usePomodoroStore((s) => s.workSessionStartedAt);

  const storeStart = usePomodoroStore((s) => s.start);
  const storePause = usePomodoroStore((s) => s.pause);
  const storeResume = usePomodoroStore((s) => s.resume);
  const storeSkip = usePomodoroStore((s) => s.skip);
  const storeReset = usePomodoroStore((s) => s.reset);
  const storeTick = usePomodoroStore((s) => s.tick);
  const getElapsedSecs = usePomodoroStore((s) => s.getElapsedSecs);
  const getPhaseDurationSecs = usePomodoroStore((s) => s.getPhaseDurationSecs);
  const dismissCelebration = usePomodoroStore((s) => s.dismissCelebration);

  // ── Display state (re-rendered every second) ───────────────────────────────
  const [displayElapsed, setDisplayElapsed] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completionHandledRef = useRef(false);

  // Sync work minutes from settings store on mount
  useEffect(() => {
    const current = usePomodoroStore.getState().workMins;
    if (current === 25 && focusSessionLength !== 25) {
      usePomodoroStore.getState().setWorkMins(focusSessionLength);
    }
  }, [focusSessionLength]);

  // ── Ticker — runs every second while active ────────────────────────────────
  useEffect(() => {
    if (isRunning && !isPaused) {
      const tick = () => {
        setDisplayElapsed(getElapsedSecs());
        const result = storeTick();
        if (result.completed && result.phase === 'work') {
          playChime();
        }
      };
      // Initial sync
      setDisplayElapsed(getElapsedSecs());
      intervalRef.current = setInterval(tick, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setDisplayElapsed(getElapsedSecs());
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, isPaused, getElapsedSecs, storeTick]);

  // ── Handle celebration (fire callback + feedback modal) ────────────────────
  useEffect(() => {
    if (showCelebration && !completionHandledRef.current) {
      completionHandledRef.current = true;

      // Fire session complete callback
      if (workSessionStartedAt) {
        const endTime = new Date().toISOString();
        onSessionComplete({
          startTime: workSessionStartedAt,
          endTime,
          duration: workMins * 60,
        });
      }

      // Show Lottie for 2.5s then open feedback
      setTimeout(() => {
        dismissCelebration();
        onRequestFeedback(null);
        completionHandledRef.current = false;
      }, 2500);
    }
  }, [showCelebration, workSessionStartedAt, workMins, onSessionComplete, onRequestFeedback, dismissCelebration]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const phaseDuration = getPhaseDurationSecs();
  const remaining = Math.max(0, phaseDuration - displayElapsed);
  const progress = phaseDuration > 0 ? Math.min(1, displayElapsed / phaseDuration) : 0;

  const phaseLabel = useMemo(() => {
    if (phase === 'work') return `Work Session ${sessionCount + 1} of ${sessionsPerCycle}`;
    if (phase === 'short_break') return 'Short Break';
    return 'Long Break';
  }, [phase, sessionCount, sessionsPerCycle]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (!isRunning) {
      storeStart();
    } else if (isPaused) {
      storeResume();
    }
  }, [isRunning, isPaused, storeStart, storeResume]);

  const handlePause = useCallback(() => {
    storePause();
  }, [storePause]);

  const handleSkip = useCallback(() => {
    storeSkip();
  }, [storeSkip]);

  const handleReset = useCallback(() => {
    storeReset();
    setDisplayElapsed(0);
  }, [storeReset]);

  // ── Settings handlers ──────────────────────────────────────────────────────
  const handleWorkMinsChange = useCallback((value: number) => {
    const clamped = Math.max(1, Math.min(240, value));
    usePomodoroStore.getState().setWorkMins(clamped);
    useSettingsStore.getState().setFocusSessionLength(clamped);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-8 px-4">
      {/* Phase label */}
      <motion.p
        key={phase + sessionCount}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-sm uppercase tracking-widest text-muted-foreground font-medium"
      >
        {phaseLabel}
      </motion.p>

      {/* Circular progress ring */}
      <div className="relative flex items-center justify-center">
        <ProgressRing progress={progress} size={RING_SIZE} strokeWidth={RING_STROKE} />

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span key={remaining} className="font-mono text-5xl font-bold text-foreground tabular-nums leading-none">
            {formatTime(remaining)}
          </motion.span>
          <motion.span
            key={phase}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-2"
            role="img"
            aria-label={phase === 'work' ? 'Timer' : 'Coffee'}
          >
            {phase === 'work' ? <TimerIcon size={28} /> : <CoffeeIcon size={28} />}
          </motion.span>
        </div>

        {/* Completion Lottie */}
        <AnimatePresence>
          {showCelebration && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <LottieAnimation
                path="/animations/pomodoro-complete.json"
                layerColorMap={POMODORO_COMPLETE_LAYER_MAP}
                width={RING_SIZE}
                height={RING_SIZE}
                loop={false}
                autoplay={true}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Control buttons */}
      <div className="flex items-center gap-3">
        {!isRunning || isPaused ? (
          <motion.button
            type="button"
            onClick={handleStart}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-6 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <PlayIcon />
            {!isRunning ? 'Start' : 'Resume'}
          </motion.button>
        ) : (
          <motion.button
            type="button"
            onClick={handlePause}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-6 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <PauseIcon />
            Pause
          </motion.button>
        )}

        <motion.button
          type="button"
          onClick={handleSkip}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-4 h-11 rounded-xl border border-border bg-card text-muted-foreground text-sm font-medium hover:bg-muted hover:text-foreground transition-colors"
        >
          <SkipIcon />
          Skip
        </motion.button>

        <AnimatePresence>
          {(isRunning || displayElapsed > 0) && (
            <motion.button
              type="button"
              onClick={handleReset}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center justify-center w-11 h-11 rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Reset timer"
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Session dots */}
      <div className="flex flex-col items-center gap-1.5">
        <SessionDots completed={sessionCount} total={sessionsPerCycle} />
        <span className="text-xs text-muted-foreground">
          {sessionCount} of {sessionsPerCycle} sessions
        </span>
      </div>

      {/* Settings */}
      <div className="w-full max-w-xs">
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-card border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="font-medium">Timer Settings</span>
          <motion.div animate={{ rotate: showSettings ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDownIcon />
          </motion.div>
        </button>

        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-4 pt-3 px-1">
                <DurationControl label="Work" value={workMins} onChange={handleWorkMinsChange} min={1} max={240} disabled={isRunning && phase === 'work'} />
                <DurationControl label="Short Break" value={shortBreakMins} onChange={(v) => usePomodoroStore.getState().setShortBreakMins(v)} min={1} max={30} disabled={isRunning && phase === 'short_break'} />
                <DurationControl label="Long Break" value={longBreakMins} onChange={(v) => usePomodoroStore.getState().setLongBreakMins(v)} min={1} max={60} disabled={isRunning && phase === 'long_break'} />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground font-medium">Sessions per Cycle</span>
                  <Select
                    value={String(sessionsPerCycle)}
                    onValueChange={(v) => usePomodoroStore.getState().setSessionsPerCycle(Number(v))}
                    disabled={isRunning}
                  >
                    <SelectTrigger className="w-20 h-8 text-sm tabular-nums focus:ring-0 focus-visible:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SESSIONS_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)} className="tabular-nums">{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// ── Duration Picker ──────────────────────────────────────────────────────────

const DURATION_HOURS = Array.from({ length: 5 }, (_, i) => String(i));
const DURATION_MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

interface DurationControlProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
}

const DurationControl: React.FC<DurationControlProps> = ({ label, value, onChange, min, max, disabled = false }) => {
  const hours = Math.floor(value / 60);
  const mins = value % 60;

  const handleHourChange = (h: string) => {
    const total = Number(h) * 60 + mins;
    onChange(Math.max(min, Math.min(max, total)));
  };

  const handleMinChange = (m: string) => {
    const total = hours * 60 + Number(m);
    onChange(Math.max(min, Math.min(max, total)));
  };

  const displayStr = hours > 0 ? `${hours}h ${String(mins).padStart(2, '0')}m` : `${mins}m`;

  return (
    <div className={`flex flex-col gap-1.5 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground font-medium">{label}</span>
        <div className="flex items-center gap-1.5 h-8 rounded-lg border border-input bg-background px-2.5 text-sm text-muted-foreground">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="opacity-50 shrink-0">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          <span className="text-foreground font-mono text-xs tabular-nums">{displayStr}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <Select value={String(hours)} onValueChange={handleHourChange} disabled={disabled}>
          <SelectTrigger className="flex-1 h-8 text-sm tabular-nums focus:ring-0 focus-visible:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-48">
            {DURATION_HOURS.map((h) => (
              <SelectItem key={h} value={h} className="tabular-nums">{h}h</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="flex items-center text-muted-foreground font-medium text-sm select-none">:</span>
        <Select value={String(mins).padStart(2, '0')} onValueChange={handleMinChange} disabled={disabled}>
          <SelectTrigger className="flex-1 h-8 text-sm tabular-nums focus:ring-0 focus-visible:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-48">
            {DURATION_MINUTES.map((m) => (
              <SelectItem key={m} value={m} className="tabular-nums">{m}m</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default PomodoroView;
