'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/store/useSettingsStore';
import { usePomodoroStore } from '@/store/usePomodoroStore';
import { useAmbientStore } from '@/store/useAmbientStore';
import { playTrack, stopTrack, setTrackVolume } from '@/lib/audio/noiseGenerator';
import { LottieAnimation, POMODORO_COMPLETE_LAYER_MAP } from '@/components/ui/LottieAnimation';
import { AMBIENT_ICONS } from '@/components/ui/AnimatedIcons';
import type { AmbientTrack } from '@/types';
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
const RING_SIZE_DESKTOP = 200;
const RING_SIZE_MOBILE = 160;
const RING_STROKE = 5;

const AMBIENT_TRACKS: { id: AmbientTrack; label: string }[] = [
  { id: 'white', label: 'White' },
  { id: 'rainfall', label: 'Rain' },
  { id: 'brown', label: 'Brown' },
  { id: 'forest', label: 'Forest' },
  { id: 'ocean', label: 'Ocean' },
];

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

const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const VolumeIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
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

// ── Ambient Sound Row ────────────────────────────────────────────────────────

const AmbientSoundRow: React.FC = () => {
  const { activeTrack, isPlaying, volume, setTrack, setVolume, stop } = useAmbientStore();

  const handleTrackClick = (track: AmbientTrack) => {
    if (activeTrack === track && isPlaying) {
      stopTrack();
      stop();
    } else {
      playTrack(track, volume);
      setTrack(track);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    setTrackVolume(v);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ambient</span>
        {isPlaying && (
          <div className="flex items-center gap-2">
            <VolumeIcon />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={handleVolumeChange}
              className="w-16 h-1 accent-primary cursor-pointer"
              aria-label="Volume"
            />
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-2">
        {AMBIENT_TRACKS.map((t) => {
          const active = activeTrack === t.id && isPlaying;
          const AmbIcon = AMBIENT_ICONS[t.id];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTrackClick(t.id)}
              className={`flex flex-col items-center gap-1 px-2.5 py-2 rounded-xl transition-all duration-150 cursor-pointer ${
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
              aria-label={t.label}
            >
              {AmbIcon ? <AmbIcon size={20} /> : null}
              <span className="text-[10px] font-medium">{t.label}</span>
            </button>
          );
        })}
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

      if (workSessionStartedAt) {
        const endTime = new Date().toISOString();
        onSessionComplete({
          startTime: workSessionStartedAt,
          endTime,
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
    <div className="relative flex items-start justify-center py-8 px-4 min-h-[calc(100vh-120px)]">
      {/* Breathing glow behind card */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: isBreak
            ? 'radial-gradient(circle, hsl(var(--primary) / 0.03), transparent 70%)'
            : 'radial-gradient(circle, hsl(var(--primary) / 0.05), transparent 70%)',
          filter: 'blur(60px)',
        }}
        animate={
          isRunning && !isPaused
            ? { opacity: [0.05, 0.12, 0.05] }
            : { opacity: 0.05 }
        }
        transition={
          isRunning && !isPaused
            ? { duration: 4, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.3 }
        }
      />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="relative w-full max-w-md rounded-2xl border border-border/60 bg-card shadow-sm p-6 sm:p-8"
      >
        <div className="flex flex-col items-center gap-5">
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

          {/* Divider */}
          <div className="w-full h-px bg-border/60" />

          {/* Ambient sound row */}
          <AmbientSoundRow />

          {/* Divider */}
          <div className="w-full h-px bg-border/60" />

          {/* Timer Settings (collapsible) */}
          <div className="w-full">
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
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
      </motion.div>
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
