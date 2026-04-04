'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/store/useSettingsStore';
import { usePomodoroStore } from '@/store/usePomodoroStore';
import { useAmbientStore } from '@/store/useAmbientStore';
import { useTaskBoardStore, selectTasksByStatus } from '@/store/useTaskBoardStore';
import { playTrack, stopTrack, setTrackVolume } from '@/lib/audio/noiseGenerator';
import { LottieAnimation, POMODORO_COMPLETE_LAYER_MAP } from '@/components/ui/LottieAnimation';
import { AMBIENT_ICONS } from '@/components/ui/AnimatedIcons';
import { Slider } from '@/components/ui/slider';
import type { AmbientTrack } from '@/types';
import type { Task } from '@/types/task';

// ── Types ────────────────────────────────────────────────────────────────────

interface PomodoroViewProps {
  onSessionComplete: (data: { startTime: string; endTime: string; duration: number }) => void;
  onRequestFeedback: (focusSessionId: string | null) => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const RING_SIZE_DESKTOP = 200;
const RING_SIZE_MOBILE = 160;
const RING_STROKE = 5;

const WORK_PRESETS = [15, 20, 25, 30, 45, 50];
const BREAK_PRESETS = [5, 10, 15, 20];
const SESSION_PRESETS = [2, 3, 4, 5, 6];

const AMBIENT_TRACKS: { id: AmbientTrack; label: string }[] = [
  { id: 'white', label: 'White' },
  { id: 'rainfall', label: 'Rain' },
  { id: 'brown', label: 'Brown' },
  { id: 'forest', label: 'Forest' },
  { id: 'ocean', label: 'Ocean' },
];

const PRIORITY_BADGE: Record<string, { label: string; className: string }> = {
  high:   { label: 'H', className: 'border-destructive/25 bg-destructive/10 text-destructive' },
  medium: { label: 'M', className: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  low:    { label: 'L', className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
};

const DIFFICULTY_BADGE: Record<string, { label: string; className: string }> = {
  easy:   { label: 'E', className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  medium: { label: 'M', className: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  hard:   { label: 'H', className: 'border-destructive/25 bg-destructive/10 text-destructive' },
};

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

// ── Progress Ring ────────────────────────────────────────────────────────────

interface ProgressRingProps {
  progress: number;
  size: number;
  strokeWidth: number;
  isBreak: boolean;
}

const ProgressRing: React.FC<ProgressRingProps> = ({ progress, size, strokeWidth, isBreak }) => {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - Math.min(1, Math.max(0, progress)));
  const cx = size / 2;
  const activeColor = isBreak ? 'hsl(var(--primary) / 0.4)' : 'hsl(var(--primary))';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth} opacity={0.5} />
      <circle
        cx={cx} cy={cx} r={r} fill="none"
        stroke={activeColor} strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={dashOffset}
        style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease' }}
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
        className={`w-2 h-2 rounded-full transition-colors ${i < completed ? 'bg-primary' : 'bg-muted'}`}
        initial={false}
        animate={i < completed ? { scale: [1, 1.3, 1] } : {}}
        transition={{ duration: 0.3 }}
      />
    ))}
  </div>
);

// ── Pill Button ──────────────────────────────────────────────────────────────

interface PillProps {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}

const Pill: React.FC<PillProps> = ({ label, active, disabled, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
      active
        ? 'bg-primary text-primary-foreground'
        : 'bg-muted text-muted-foreground hover:bg-muted/80'
    } ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
  >
    {label}
  </button>
);

// ── Right Panel: Session Config ──────────────────────────────────────────────

interface SessionConfigProps {
  workMins: number;
  shortBreakMins: number;
  sessionsPerCycle: number;
  isRunning: boolean;
  phase: string;
  onWorkChange: (m: number) => void;
  onBreakChange: (m: number) => void;
  onSessionsChange: (n: number) => void;
}

const SessionConfig: React.FC<SessionConfigProps> = ({
  workMins, shortBreakMins, sessionsPerCycle, isRunning, phase,
  onWorkChange, onBreakChange, onSessionsChange,
}) => {
  const longBreak = sessionsPerCycle * 5;

  return (
    <div>
      <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Session</span>
      <div className="mt-3 space-y-3">
        {/* Work duration */}
        <div>
          <span className="text-sm text-muted-foreground">Work</span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {WORK_PRESETS.map((m) => (
              <Pill key={m} label={`${m}m`} active={workMins === m} disabled={isRunning && phase === 'work'} onClick={() => onWorkChange(m)} />
            ))}
          </div>
        </div>
        {/* Break duration */}
        <div>
          <span className="text-sm text-muted-foreground">Break</span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {BREAK_PRESETS.map((m) => (
              <Pill key={m} label={`${m}m`} active={shortBreakMins === m} disabled={isRunning && (phase === 'short_break' || phase === 'long_break')} onClick={() => onBreakChange(m)} />
            ))}
          </div>
        </div>
        {/* Sessions per cycle */}
        <div>
          <span className="text-sm text-muted-foreground">Sessions</span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {SESSION_PRESETS.map((n) => (
              <Pill key={n} label={String(n)} active={sessionsPerCycle === n} disabled={isRunning} onClick={() => onSessionsChange(n)} />
            ))}
          </div>
        </div>
        {/* Long break computed */}
        <p className="text-xs text-muted-foreground">Long break &middot; {longBreak}m</p>
      </div>
    </div>
  );
};

// ── Right Panel: Ambient Section ─────────────────────────────────────────────

const AmbientSection: React.FC = () => {
  const activeTrack = useAmbientStore((s) => s.activeTrack);
  const isPlaying = useAmbientStore((s) => s.isPlaying);
  const volume = useAmbientStore((s) => s.volume);
  const setTrack = useAmbientStore((s) => s.setTrack);
  const setVolume = useAmbientStore((s) => s.setVolume);
  const stopAmbient = useAmbientStore((s) => s.stop);

  const handleTrackClick = (track: AmbientTrack) => {
    if (activeTrack === track && isPlaying) {
      // Clicking active playing track → stop
      stopTrack();
      stopAmbient();
    } else {
      // Clicking any other track (or same track when stopped) → play it
      playTrack(track, volume);
      setTrack(track);
    }
  };

  const handleVolumeChange = (values: number[]) => {
    const v = values[0];
    setVolume(v);
    setTrackVolume(v);
  };

  return (
    <div>
      <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Ambient</span>
      <div className="grid grid-cols-5 gap-2 mt-3">
        {AMBIENT_TRACKS.map((t) => {
          const active = activeTrack === t.id && isPlaying;
          const AmbIcon = AMBIENT_ICONS[t.id];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTrackClick(t.id)}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl p-2 aspect-square max-w-[52px] w-full transition-all duration-150 ${
                active
                  ? 'bg-primary/15 border border-primary/30'
                  : 'bg-muted border border-transparent hover:bg-muted/80'
              }`}
              aria-label={t.label}
            >
              {AmbIcon ? <AmbIcon size={18} /> : null}
              <span className="text-[10px] font-medium text-muted-foreground leading-none">{t.label}</span>
            </button>
          );
        })}
      </div>
      {/* Volume slider — only when playing */}
      <AnimatePresence>
        {isPlaying && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2.5 pt-3">
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground flex-shrink-0">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
              <Slider
                value={[volume]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={handleVolumeChange}
                aria-label="Volume"
                className="flex-1"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Right Panel: Task Selector ───────────────────────────────────────────────

const TaskSelector: React.FC<{
  focusTask: Task | null;
  onSelect: (task: Task | null) => void;
}> = ({ focusTask, onSelect }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const todoTasks = useTaskBoardStore(selectTasksByStatus('todo'));
  const doingTasks = useTaskBoardStore(selectTasksByStatus('doing'));
  const availableTasks = useMemo(() => [...doingTasks, ...todoTasks], [doingTasks, todoTasks]);

  const filtered = useMemo(() => {
    if (!query.trim()) return availableTasks.slice(0, 5);
    const q = query.toLowerCase();
    return availableTasks.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 5);
  }, [query, availableTasks]);

  if (focusTask) {
    const p = PRIORITY_BADGE[focusTask.priority];
    const d = DIFFICULTY_BADGE[focusTask.difficulty];
    return (
      <div>
        <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Focusing On</span>
        <div className="relative mt-3 bg-muted rounded-lg px-3 py-2.5 pr-8">
          <p className="text-sm text-foreground font-medium truncate">{focusTask.title}</p>
          <div className="flex items-center gap-1.5 mt-1">
            {p && <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded border ${p.className}`}>{p.label}</span>}
            {d && <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded border ${d.className}`}>{d.label}</span>}
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="absolute top-2.5 right-2.5 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Deselect task"
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Focusing On</span>
      <div className="relative mt-3">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search tasks..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="w-full bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/30"
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
            {filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onSelect(t); setQuery(''); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors truncate"
              >
                {t.title}
              </button>
            ))}
          </div>
        )}
        {open && filtered.length === 0 && query.trim() && (
          <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg p-3">
            <p className="text-xs text-muted-foreground">No tasks found</p>
          </div>
        )}
      </div>
    </div>
  );
};

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

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [displayElapsed, setDisplayElapsed] = useState(0);
  const [focusTask, setFocusTask] = useState<Task | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completionHandledRef = useRef(false);

  // Responsive ring size
  const [ringSize, setRingSize] = useState(RING_SIZE_DESKTOP);
  useEffect(() => {
    const check = () => setRingSize(window.innerWidth < 640 ? RING_SIZE_MOBILE : RING_SIZE_DESKTOP);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Sync work minutes from settings store on mount
  useEffect(() => {
    const current = usePomodoroStore.getState().workMins;
    if (current === 25 && focusSessionLength !== 25) {
      usePomodoroStore.getState().setWorkMins(focusSessionLength);
    }
  }, [focusSessionLength]);

  // ── Ticker ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isRunning && !isPaused) {
      const tick = () => {
        setDisplayElapsed(getElapsedSecs());
        const result = storeTick();
        if (result.completed && result.phase === 'work') {
          playChime();
        }
      };
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

  // ── Celebration handler ────────────────────────────────────────────────────
  useEffect(() => {
    if (showCelebration && !completionHandledRef.current) {
      completionHandledRef.current = true;
      if (workSessionStartedAt) {
        onSessionComplete({
          startTime: workSessionStartedAt,
          endTime: new Date().toISOString(),
          duration: workMins * 60,
        });
      }
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
  const isBreak = phase !== 'work';

  const phaseLabel = useMemo(() => {
    if (phase === 'work') return `Work Session ${sessionCount + 1} of ${sessionsPerCycle}`;
    if (phase === 'short_break') return 'Short Break';
    return 'Long Break';
  }, [phase, sessionCount, sessionsPerCycle]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (!isRunning) storeStart();
    else if (isPaused) storeResume();
  }, [isRunning, isPaused, storeStart, storeResume]);

  const handlePause = useCallback(() => storePause(), [storePause]);
  const handleSkip = useCallback(() => storeSkip(), [storeSkip]);
  const handleReset = useCallback(() => { storeReset(); setDisplayElapsed(0); }, [storeReset]);

  // ── Settings handlers ──────────────────────────────────────────────────────
  const handleWorkChange = useCallback((m: number) => {
    usePomodoroStore.getState().setWorkMins(m);
    useSettingsStore.getState().setFocusSessionLength(m);
  }, []);

  const handleBreakChange = useCallback((m: number) => {
    usePomodoroStore.getState().setShortBreakMins(m);
  }, []);

  const handleSessionsChange = useCallback((n: number) => {
    usePomodoroStore.getState().setSessionsPerCycle(n);
    // Auto-compute long break as sessions × 5
    usePomodoroStore.getState().setLongBreakMins(n * 5);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex items-start justify-center py-8 px-4 min-h-[calc(100vh-120px)]">
      {/* Breathing glow */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: isBreak
            ? 'radial-gradient(circle, hsl(var(--primary) / 0.03), transparent 70%)'
            : 'radial-gradient(circle, hsl(var(--primary) / 0.05), transparent 70%)',
          filter: 'blur(60px)',
        }}
        animate={isRunning && !isPaused ? { opacity: [0.05, 0.12, 0.05] } : { opacity: 0.05 }}
        transition={isRunning && !isPaused ? { duration: 4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
      />

      {/* Two-column card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="relative w-full max-w-[900px] rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-[1fr_280px] min-h-[520px]"
      >
        {/* ── LEFT: Timer Column ────────────────────────────────────── */}
        <div className="flex flex-col items-center justify-center gap-5 p-6 sm:p-8 md:border-r md:border-border/40">
          {/* Phase label */}
          <motion.p
            key={phase + sessionCount}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs uppercase tracking-widest text-muted-foreground font-medium"
          >
            {phaseLabel}
          </motion.p>

          {/* Ring + timer */}
          <div className="relative flex items-center justify-center">
            <ProgressRing progress={progress} size={ringSize} strokeWidth={RING_STROKE} isBreak={isBreak} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-6xl font-bold text-foreground tabular-nums leading-none">
                {formatTime(remaining)}
              </span>
            </div>
            {/* Celebration overlay */}
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
                    width={ringSize}
                    height={ringSize}
                    loop={false}
                    autoplay={true}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Session dots */}
          <div className="flex flex-col items-center gap-1.5">
            <SessionDots completed={sessionCount} total={sessionsPerCycle} />
            <span className="text-[11px] text-muted-foreground">
              {sessionCount} of {sessionsPerCycle} sessions
            </span>
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

          {/* Stop session — only when running */}
          <AnimatePresence>
            {isRunning && (
              <motion.button
                type="button"
                onClick={handleReset}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Stop session
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* ── RIGHT: Settings Panel ─────────────────────────────────── */}
        <div className="bg-muted/30 p-5 md:p-6 flex flex-col gap-6 border-t md:border-t-0 border-border/40 md:rounded-r-2xl rounded-b-2xl md:rounded-bl-none overflow-y-auto">
          <SessionConfig
            workMins={workMins}
            shortBreakMins={shortBreakMins}
            sessionsPerCycle={sessionsPerCycle}
            isRunning={isRunning}
            phase={phase}
            onWorkChange={handleWorkChange}
            onBreakChange={handleBreakChange}
            onSessionsChange={handleSessionsChange}
          />

          <div className="h-px bg-border/40" />

          <AmbientSection />

          <div className="h-px bg-border/40" />

          <TaskSelector focusTask={focusTask} onSelect={setFocusTask} />
        </div>
      </motion.div>
    </div>
  );
};

export default PomodoroView;
