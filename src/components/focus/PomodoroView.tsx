'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/store/useSettingsStore';
import { LottieAnimation, POMODORO_COMPLETE_LAYER_MAP } from '@/components/ui/LottieAnimation';

// ── Types ────────────────────────────────────────────────────────────────────

type Phase = 'work' | 'short_break' | 'long_break';

interface PomodoroViewProps {
  onSessionComplete: (data: { startTime: string; endTime: string; duration: number }) => void;
  onRequestFeedback: (focusSessionId: string | null) => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SHORT_BREAK_SECS = 5 * 60;
const LONG_BREAK_SECS = 20 * 60;
const SESSIONS_PER_CYCLE = 4;
const RING_SIZE = 220;
const RING_STROKE = 6;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format seconds as MM:SS. */
function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

/** Generate a simple completion chime using the Web Audio API. */
function playChime(): void {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Two-tone ascending chime: C5 then E5
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

    // Close context after sounds finish
    setTimeout(() => ctx.close().catch(() => {}), 2000);
  } catch {
    // Web Audio not available — silent fallback
  }
}

/** Get the label for a phase. */
function phaseLabel(phase: Phase, sessionCount: number): string {
  if (phase === 'work') return `Work Session ${sessionCount + 1} of ${SESSIONS_PER_CYCLE}`;
  if (phase === 'short_break') return 'Short Break';
  return 'Long Break';
}

/** Get the emoji for a phase. */
function phaseEmoji(phase: Phase): string {
  return phase === 'work' ? '\uD83C\uDF45' : '\u2615';
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
      {/* Muted track */}
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke="hsl(var(--muted))"
        strokeWidth={strokeWidth}
        opacity={0.5}
      />
      {/* Primary progress arc */}
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        style={{ transition: 'stroke-dashoffset 1s linear' }}
      />
    </svg>
  );
};

// ── Session Dots ─────────────────────────────────────────────────────────────

interface SessionDotsProps {
  completed: number;
  total: number;
}

const SessionDots: React.FC<SessionDotsProps> = ({ completed, total }) => (
  <div className="flex items-center gap-2">
    {Array.from({ length: total }, (_, i) => (
      <motion.div
        key={i}
        className={`w-2.5 h-2.5 rounded-full transition-colors ${
          i < completed ? 'bg-primary' : 'bg-muted'
        }`}
        initial={false}
        animate={i < completed ? { scale: [1, 1.3, 1] } : {}}
        transition={{ duration: 0.3 }}
      />
    ))}
  </div>
);

// ── Main Component ───────────────────────────────────────────────────────────

const PomodoroView: React.FC<PomodoroViewProps> = ({ onSessionComplete, onRequestFeedback }) => {
  // ── Settings ─────────────────────────────────────────────────────────────
  const focusSessionLength = useSettingsStore((s) => s.focusSessionLength);

  // ── Timer State ──────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('work');
  const [elapsed, setElapsed] = useState(0);
  const [sessionCount, setSessionCount] = useState(0); // completed work sessions in cycle
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // ── Settings Panel ───────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [localWorkMins, setLocalWorkMins] = useState(focusSessionLength);
  const [localShortBreakMins, setLocalShortBreakMins] = useState(5);
  const [localLongBreakMins, setLocalLongBreakMins] = useState(20);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartRef = useRef<string | null>(null);

  // Sync local work minutes when the store value changes (e.g. on hydration)
  useEffect(() => {
    setLocalWorkMins(focusSessionLength);
  }, [focusSessionLength]);

  // ── Derived Values ───────────────────────────────────────────────────────

  /** Duration of the current phase in seconds. */
  const phaseDuration = useMemo(() => {
    if (phase === 'work') return localWorkMins * 60;
    if (phase === 'short_break') return localShortBreakMins * 60;
    return localLongBreakMins * 60;
  }, [phase, localWorkMins, localShortBreakMins, localLongBreakMins]);

  const remaining = Math.max(0, phaseDuration - elapsed);
  const progress = phaseDuration > 0 ? Math.min(1, elapsed / phaseDuration) : 0;

  // ── Phase Transition Logic ───────────────────────────────────────────────

  /** Advance to the next phase in the pomodoro cycle. */
  const advancePhase = useCallback(() => {
    if (phase === 'work') {
      const newCount = sessionCount + 1;
      setSessionCount(newCount);

      // Fire completion callback for the work session
      if (sessionStartRef.current) {
        const endTime = new Date().toISOString();
        onSessionComplete({
          startTime: sessionStartRef.current,
          endTime,
          duration: localWorkMins * 60,
        });

        // Show completion animation, then open feedback
        setShowComplete(true);
        setTimeout(() => {
          setShowComplete(false);
          onRequestFeedback(null);
        }, 2000);
      }

      // Play chime to signal work session end
      playChime();

      // Determine next phase: long break every SESSIONS_PER_CYCLE, else short break
      if (newCount >= SESSIONS_PER_CYCLE) {
        setPhase('long_break');
        setSessionCount(0); // reset cycle
      } else {
        setPhase('short_break');
      }
    } else {
      // After any break, go back to work
      setPhase('work');
    }

    // Reset timer for the new phase
    setElapsed(0);
    setIsRunning(false);
    setIsPaused(false);
    sessionStartRef.current = null;
  }, [phase, sessionCount, localWorkMins, onSessionComplete, onRequestFeedback]);

  // ── Timer Tick ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (isRunning && !isPaused) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          return next;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, isPaused]);

  // Check for phase completion in a separate effect to avoid stale closures
  useEffect(() => {
    if (isRunning && elapsed >= phaseDuration) {
      advancePhase();
    }
  }, [elapsed, phaseDuration, isRunning, advancePhase]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    if (!isRunning) {
      // Starting fresh
      setIsRunning(true);
      setIsPaused(false);
      if (phase === 'work') {
        sessionStartRef.current = new Date().toISOString();
      }
    } else if (isPaused) {
      // Resuming from pause
      setIsPaused(false);
    }
  }, [isRunning, isPaused, phase]);

  const handlePause = useCallback(() => {
    if (isRunning && !isPaused) {
      setIsPaused(true);
    }
  }, [isRunning, isPaused]);

  const handleSkip = useCallback(() => {
    advancePhase();
  }, [advancePhase]);

  const handleReset = useCallback(() => {
    setElapsed(0);
    setIsRunning(false);
    setIsPaused(false);
    sessionStartRef.current = null;
  }, []);

  // ── Settings Handlers ────────────────────────────────────────────────────

  const handleWorkMinsChange = useCallback((value: number) => {
    const clamped = Math.max(1, Math.min(240, value));
    setLocalWorkMins(clamped);
    // Persist to settings store so other components see the change
    useSettingsStore.getState().setFocusSessionLength(clamped);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-8 px-4">
      {/* Phase label */}
      <motion.p
        key={phase + sessionCount}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-sm uppercase tracking-widest text-muted-foreground font-medium"
      >
        {phaseLabel(phase, sessionCount)}
      </motion.p>

      {/* Circular progress ring with time display */}
      <div className="relative flex items-center justify-center">
        <ProgressRing progress={progress} size={RING_SIZE} strokeWidth={RING_STROKE} />

        {/* Time + emoji overlay (centered inside ring) */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            key={remaining}
            className="font-mono text-5xl font-bold text-foreground tabular-nums leading-none"
          >
            {formatTime(remaining)}
          </motion.span>
          <motion.span
            key={phase}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-2 text-2xl"
            role="img"
            aria-label={phase === 'work' ? 'Tomato' : 'Coffee'}
          >
            {phaseEmoji(phase)}
          </motion.span>
        </div>

        {/* Completion animation overlay */}
        <AnimatePresence>
          {showComplete && (
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
        {/* Start / Pause */}
        {!isRunning || isPaused ? (
          <motion.button
            type="button"
            onClick={handleStart}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-6 h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
          >
            <PlayIcon />
            {!isRunning ? 'Start' : 'Resume'}
          </motion.button>
        ) : (
          <motion.button
            type="button"
            onClick={handlePause}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-6 h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
          >
            <PauseIcon />
            Pause
          </motion.button>
        )}

        {/* Skip to next phase */}
        <motion.button
          type="button"
          onClick={handleSkip}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-4 h-11 rounded-2xl border border-border bg-card text-muted-foreground text-sm font-medium hover:bg-muted hover:text-foreground transition-colors"
        >
          <SkipIcon />
          Skip
        </motion.button>

        {/* Reset (only visible when timer has been started) */}
        <AnimatePresence>
          {(isRunning || elapsed > 0) && (
            <motion.button
              type="button"
              onClick={handleReset}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center justify-center w-11 h-11 rounded-2xl border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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

      {/* Session dots — shows progress through the 4-session cycle */}
      <div className="flex flex-col items-center gap-1.5">
        <SessionDots completed={sessionCount} total={SESSIONS_PER_CYCLE} />
        <span className="text-xs text-muted-foreground">
          {sessionCount} of {SESSIONS_PER_CYCLE} sessions
        </span>
      </div>

      {/* Collapsible settings section */}
      <div className="w-full max-w-xs">
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-card border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="font-medium">Timer Settings</span>
          <motion.div
            animate={{ rotate: showSettings ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
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
                {/* Work duration */}
                <DurationControl
                  label="Work"
                  value={localWorkMins}
                  onChange={handleWorkMinsChange}
                  min={1}
                  max={240}
                  disabled={isRunning && phase === 'work'}
                />
                {/* Short break duration */}
                <DurationControl
                  label="Short Break"
                  value={localShortBreakMins}
                  onChange={setLocalShortBreakMins}
                  min={1}
                  max={30}
                  disabled={isRunning && phase === 'short_break'}
                />
                {/* Long break duration */}
                <DurationControl
                  label="Long Break"
                  value={localLongBreakMins}
                  onChange={setLocalLongBreakMins}
                  min={1}
                  max={60}
                  disabled={isRunning && phase === 'long_break'}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// ── Duration Control Sub-component ───────────────────────────────────────────

interface DurationControlProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
}

const DurationControl: React.FC<DurationControlProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  disabled = false,
}) => (
  <div className={`flex items-center justify-between ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
    <span className="text-sm text-foreground">{label}</span>
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center text-lg transition-colors"
        aria-label={`Decrease ${label} duration`}
      >
        -
      </button>
      <span className="w-12 text-center font-mono text-sm font-semibold text-foreground tabular-nums">
        {value}m
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-8 h-8 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center text-lg transition-colors"
        aria-label={`Increase ${label} duration`}
      >
        +
      </button>
    </div>
  </div>
);

export default PomodoroView;
