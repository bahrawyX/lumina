'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { usePomodoroStore } from '@/store/usePomodoroStore';
import { LottieAnimation, POMODORO_COMPLETE_LAYER_MAP } from '@/components/ui/LottieAnimation';

// ── Constants ────────────────────────────────────────────────────────────────

const ORB_SIZE = 56;
const RING_R = 22;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function playChime(): void {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    [523.25, 659.25].forEach((freq, i) => {
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

// ── Component ────────────────────────────────────────────────────────────────

const PomodoroFloatingWidget: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();

  const isRunning = usePomodoroStore((s) => s.isRunning);
  const isPaused = usePomodoroStore((s) => s.isPaused);
  const phase = usePomodoroStore((s) => s.phase);
  const showCelebration = usePomodoroStore((s) => s.showCelebration);
  const getElapsedSecs = usePomodoroStore((s) => s.getElapsedSecs);
  const getPhaseDurationSecs = usePomodoroStore((s) => s.getPhaseDurationSecs);
  const tick = usePomodoroStore((s) => s.tick);

  const [displayRemaining, setDisplayRemaining] = useState(0);
  const [progress, setProgress] = useState(0);
  const [showLottie, setShowLottie] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Only show when NOT on the pomodoro/focus page and timer is active
  const isOnPomodoroPage = pathname === '/pomodoro' || pathname === '/focus';
  const shouldShow = (isRunning || showCelebration || showLottie) && !isOnPomodoroPage;

  // Ticker for the floating widget
  useEffect(() => {
    if (!isRunning || isPaused || isOnPomodoroPage) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Still update display once
      const dur = getPhaseDurationSecs();
      const elapsed = getElapsedSecs();
      setDisplayRemaining(Math.max(0, dur - elapsed));
      setProgress(dur > 0 ? Math.min(1, elapsed / dur) : 0);
      return;
    }

    const update = () => {
      const dur = getPhaseDurationSecs();
      const elapsed = getElapsedSecs();
      setDisplayRemaining(Math.max(0, dur - elapsed));
      setProgress(dur > 0 ? Math.min(1, elapsed / dur) : 0);

      const result = tick();
      if (result.completed && result.phase === 'work') {
        playChime();
        setShowLottie(true);
        setTimeout(() => setShowLottie(false), 3000);
      }
    };

    update();
    intervalRef.current = setInterval(update, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, isPaused, isOnPomodoroPage, getElapsedSecs, getPhaseDurationSecs, tick]);

  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);

  const phaseColor = phase === 'work'
    ? 'text-primary'
    : phase === 'short_break'
    ? 'text-emerald-500'
    : 'text-amber-500';

  const phaseStroke = phase === 'work'
    ? 'hsl(var(--primary))'
    : phase === 'short_break'
    ? '#10b981'
    : '#f59e0b';

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.5, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[90]"
        >
          {/* Lottie celebration overlay */}
          <AnimatePresence>
            {showLottie && (
              <motion.div
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="absolute -inset-8 z-20 pointer-events-none"
              >
                <LottieAnimation
                  path="/animations/pomodoro-complete.json"
                  layerColorMap={POMODORO_COMPLETE_LAYER_MAP}
                  width={ORB_SIZE + 64}
                  height={ORB_SIZE + 64}
                  loop={false}
                  autoplay={true}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Clickable orb */}
          <motion.button
            onClick={() => router.push('/pomodoro')}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            className="relative flex items-center justify-center bg-card border border-border/60 rounded-full shadow-lg cursor-pointer"
            style={{ width: ORB_SIZE, height: ORB_SIZE }}
            title={`Pomodoro — ${phase === 'work' ? 'Working' : phase === 'short_break' ? 'Short Break' : 'Long Break'}`}
          >
            {/* Progress ring */}
            <svg
              className="absolute inset-0 -rotate-90"
              width={ORB_SIZE}
              height={ORB_SIZE}
              viewBox={`0 0 ${ORB_SIZE} ${ORB_SIZE}`}
            >
              <circle
                cx={ORB_SIZE / 2}
                cy={ORB_SIZE / 2}
                r={RING_R}
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth={3}
                opacity={0.3}
              />
              <circle
                cx={ORB_SIZE / 2}
                cy={ORB_SIZE / 2}
                r={RING_R}
                fill="none"
                stroke={phaseStroke}
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>

            {/* Timer text */}
            <span className={`text-[11px] font-bold tabular-nums z-10 ${phaseColor}`}>
              {formatTime(displayRemaining)}
            </span>

            {/* Pause indicator */}
            {isPaused && (
              <motion.div
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <svg width={8} height={8} viewBox="0 0 24 24" fill="white">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              </motion.div>
            )}
          </motion.button>

          {/* Phase label */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground text-center mt-1.5"
          >
            {phase === 'work' ? 'Focus' : phase === 'short_break' ? 'Break' : 'Long Break'}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PomodoroFloatingWidget;
