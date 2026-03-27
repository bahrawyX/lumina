'use client';

/**
 * TimerCallout — Ignite Flow
 * ——————————————————————————
 * Floating, draggable deep work launcher.
 * No phases. No gamification. Just structured focus entry.
 *
 * States:
 *   idle      → Fixed Ignite Flow button. Click reveals Classic / Deep Work.
 *   running   → Draggable countdown widget. Stop button. Auto-completes on expiry.
 *   completed → Brief "5m reset?" suggestion, then returns to idle.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TimerIcon, CloseIcon, MinimizeIcon } from './icons';
import { useCalendarStore } from '../store/useCalendarStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { focusModeFromMinutes } from '../lib/focusSettings';
import { Button } from './ui/button';

// ── Layout constants ──────────────────────────────────────────────────────────
const EXPANDED_W = 300;
const EXPANDED_H = 260;
const COLLAPSED_W = 76;
const COLLAPSED_H = 76;
const PAD = 16;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ─────────────────────────────────────────────────────────────────────────────
const TimerCallout: React.FC = () => {
  const {
    activeFocusSession,
    startFocusSession,
    completeFocusSession,
    cancelFocusSession,
    isTimerExpanded,
    setTimerExpanded,
    timerPosition,
    setTimerPosition,
  } = useCalendarStore();

  const focusSessionLength = useSettingsStore((s) => s.focusSessionLength);
  const [timeLeft, setTimeLeft] = useState(0);
  const [justCompleted, setJustCompleted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasDragged = useRef(false);

  // ── Widget dimensions ──────────────────────────────────────────────────────
  const w = isTimerExpanded ? EXPANDED_W : COLLAPSED_W;
  const h = isTimerExpanded ? EXPANDED_H : COLLAPSED_H;

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : EXPANDED_W + PAD * 2;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : EXPANDED_H + PAD * 2;

  const defaultCoords = useMemo(() => ({
    x: viewportWidth - EXPANDED_W - PAD,
    y: 80,
  }), [viewportWidth]);

  const rawX = timerPosition?.x ?? defaultCoords.x;
  const rawY = timerPosition?.y ?? defaultCoords.y;
  const currentX = clamp(rawX, PAD, viewportWidth - w - PAD);
  const currentY = clamp(rawY, PAD, viewportHeight - h - PAD);

  // Re-clamp when widget resizes
  useEffect(() => {
    if (!timerPosition) return;
    const cx = clamp(timerPosition.x, PAD, window.innerWidth - w - PAD);
    const cy = clamp(timerPosition.y, PAD, window.innerHeight - h - PAD);
    if (cx !== timerPosition.x || cy !== timerPosition.y) setTimerPosition({ x: cx, y: cy });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTimerExpanded]);

  // ── Countdown tick ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeFocusSession || activeFocusSession.status !== 'running') return;
    const tick = () => {
      const end = new Date(activeFocusSession.startedAt).getTime() + activeFocusSession.durationMinutes * 60_000;
      const remaining = Math.max(0, end - Date.now());
      setTimeLeft(Math.floor(remaining / 1_000));
      if (remaining <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        completeFocusSession();
        setJustCompleted(true);
        setTimeout(() => setJustCompleted(false), 8_000);
      }
    };
    tick();
    intervalRef.current = setInterval(tick, 1_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFocusSession?.id, activeFocusSession?.startedAt]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const totalSecs = activeFocusSession ? activeFocusSession.durationMinutes * 60 : 1;
  const progressPct = activeFocusSession ? Math.min(1, 1 - timeLeft / totalSecs) : 0;
  const modeLabel = activeFocusSession?.mode === 'deep' ? 'Deep Work' : 'Classic';

  // ── IDLE — Ignite Flow button ──────────────────────────────────────────────
  if (!activeFocusSession) {
    return (
      <div className="fixed bottom-12 right-12 z-[60]">
        <AnimatePresence>
          {justCompleted && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={() => {
                startFocusSession(focusModeFromMinutes(focusSessionLength), focusSessionLength);
                setJustCompleted(false);
              }}
              className="absolute -top-16 right-0 whitespace-nowrap px-5 py-2.5 bg-white dark:bg-neutral-panel border border-gray-100 dark:border-neutral-border shadow-soft rounded-2xl text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:text-primary transition-colors"
            >
              Start preferred session?
            </motion.button>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.05, y: -3 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => startFocusSession(focusModeFromMinutes(focusSessionLength), focusSessionLength)}
          className="w-14 h-14 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg relative"
          aria-label="Ignite Flow"
        >
          <TimerIcon size={22} />
        </motion.button>
      </div>
    );
  }

  // ── ACTIVE SESSION — draggable widget ─────────────────────────────────────
  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0}
      onDragStart={() => { hasDragged.current = false; }}
      onDrag={() => { hasDragged.current = true; }}
      onDragEnd={(_, info) => {
        const nx = clamp(currentX + info.offset.x, PAD, window.innerWidth - w - PAD);
        const ny = clamp(currentY + info.offset.y, PAD, window.innerHeight - h - PAD);
        setTimerPosition({ x: nx, y: ny });
        setTimeout(() => { hasDragged.current = false; }, 80);
      }}
      animate={{
        x: currentX,
        y: currentY,
        width: isTimerExpanded ? EXPANDED_W : COLLAPSED_W,
        height: isTimerExpanded ? EXPANDED_H : COLLAPSED_H,
        borderRadius: 32,
      }}
      transition={{ type: 'spring', damping: 30, stiffness: 220 }}
      className="fixed top-0 left-0 z-[100] cursor-grab active:cursor-grabbing select-none bg-white dark:bg-neutral-panel shadow-layered overflow-hidden border border-gray-100/60 dark:border-neutral-border/40"
    >
      <AnimatePresence mode="wait">
        {isTimerExpanded ? (
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="absolute inset-0 p-6 flex flex-col gap-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">{modeLabel}</p>
                <p className="text-[11px] font-medium text-gray-400 mt-0.5">Session active</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setTimerExpanded(false)} title="Minimize"><MinimizeIcon size={14} /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={cancelFocusSession} title="Cancel"><CloseIcon size={14} /></Button>
              </div>
            </div>

            {/* Countdown display */}
            <div className="flex-1 flex flex-col items-center justify-center rounded-2xl bg-gray-50/70 dark:bg-neutral-dark/50 border border-gray-100/60 dark:border-neutral-border/20 relative overflow-hidden">
              <motion.div
                className="absolute bottom-0 left-0 h-[3px] bg-primary/25"
                animate={{ width: `${progressPct * 100}%` }}
                transition={{ duration: 1, ease: 'linear' }}
              />
              <span className="text-5xl font-black tracking-widest text-gray-900 dark:text-gray-50 font-mono tabular-nums z-10">
                {formatTime(timeLeft)}
              </span>
              <span className="mt-2 text-[9px] font-bold uppercase tracking-widest text-gray-400 z-10">remaining</span>
            </div>

            {/* Cancel */}
            <Button
              variant="ghost"
              className="w-full rounded-2xl text-[11px] font-semibold text-gray-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500"
              onClick={cancelFocusSession}
            >
              Cancel session
            </Button>
          </motion.div>
        ) : (
          /* Orb / collapsed */
          <motion.button
            key="orb"
            onClick={() => { if (hasDragged.current) return; setTimerExpanded(true); }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex flex-col items-center justify-center"
            title="Expand timer"
          >
            <svg className="absolute inset-0 w-full h-full -rotate-90">
              <circle cx="38" cy="38" r="30" className="stroke-gray-100 dark:stroke-neutral-border" strokeWidth="4" fill="transparent" />
              <motion.circle
                cx="38" cy="38" r="30"
                stroke="currentColor" className="text-primary"
                strokeWidth="4" fill="transparent" strokeLinecap="round"
                animate={{ strokeDashoffset: (2 * Math.PI * 30) * (1 - progressPct) }}
                transition={{ duration: 1, ease: 'linear' }}
                style={{ strokeDasharray: 2 * Math.PI * 30 }}
              />
            </svg>
            <span className="text-[12px] font-black tabular-nums text-gray-800 dark:text-gray-100 z-10">
              {formatTime(timeLeft)}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default TimerCallout;
