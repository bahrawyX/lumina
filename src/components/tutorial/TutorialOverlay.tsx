'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTutorialStore } from '@/store/useTutorialStore';

/* ── Step definitions ─────────────────────────────────────────────── */

interface TutorialStep {
  target: string;
  icon: string;
  title: string;
  desc: string;
  hint?: string;
  /** If target element is not found within 1.5s, auto-advance */
  optional?: boolean;
}

const STEPS: TutorialStep[] = [
  {
    target: 'new-entry',
    icon: '✦',
    title: 'Quick Add',
    desc: 'Capture an event, task, or doc from anywhere — date, priority, difficulty, and goal link in one shot.',
    hint: 'Shortcut: Ctrl+K (Cmd+K on Mac)',
  },
  {
    target: 'ignite-flow',
    icon: '⚡',
    title: 'Start a Focus Session',
    desc: 'Start a timed focus session. Your streak updates automatically.',
  },
  {
    target: 'nav-calendar',
    icon: '\u25A3',
    title: 'Your Calendar',
    desc: 'Month, week, and day views. Click to explore — drag events to instantly reschedule anything.',
  },
  {
    target: 'cal-view-tabs',
    icon: '⊞',
    title: 'Switch Views',
    desc: 'Toggle between Month, Week, and Day views. While you\'re on Calendar: M, W, D switch view, T jumps to today, N opens new event, F toggles focus mode.',
    optional: true,
  },
  {
    target: 'nav-tasks',
    icon: '▦',
    title: 'Task Board',
    desc: 'Kanban-style board for everything on your list. Click to see your columns.',
  },
  {
    target: 'task-board-header',
    icon: '◫',
    title: 'To Do → Doing → Done',
    desc: 'Drag cards between columns as you make progress. Click any column to quickly add a task.',
    optional: true,
  },
  {
    target: 'nav-goals',
    icon: '◉',
    title: 'Goals',
    desc: 'Track weekly, monthly, or quarterly goals. Link tasks to targets and watch progress update as you work.',
  },
  {
    target: 'nav-plan',
    icon: '◎',
    title: 'Plan Your Day',
    desc: 'Pull tasks from your backlog into your daily timeline. Click to explore.',
  },
  {
    target: 'plan-pool',
    icon: '▤',
    title: 'Task Pool',
    desc: 'Drag tasks from the pool onto the timeline to block time for them on your calendar.',
    optional: true,
  },
  {
    target: 'nav-pomodoro',
    icon: '◐',
    title: 'Pomodoro',
    desc: 'Work in focused cycles. Lumina tracks your mood after each session and builds your streak.',
  },
  {
    target: 'pomodoro-view',
    icon: '⏱',
    title: 'Your Focus Ring',
    desc: 'Start, pause, and resume from here. Earn coins when you finish at least 75% of a session.',
    optional: true,
  },
  {
    target: 'nav-intelligence',
    icon: '✦',
    title: 'Insights',
    desc: 'Your AI morning brief, weekly patterns, and suggestions — all in one panel.',
  },
  {
    target: 'daily-brief',
    icon: '☀',
    title: 'Daily Brief',
    desc: 'A quick overview of your day: top tasks, upcoming events, and focus plan.',
    optional: true,
  },
  {
    target: 'nav-performance',
    icon: '↑',
    title: 'Performance',
    desc: 'See your focus history as a contribution heatmap. Streaks, coins, and session stats in one place.',
  },
  {
    target: 'nav-shop',
    icon: '◆',
    title: 'Shop',
    desc: 'Spend coins earned from focus sessions on powerups, cosmetics, and unlocks.',
  },
  {
    target: 'nav-docs',
    icon: '▭',
    title: 'Docs',
    desc: 'Write notes that connect directly to your tasks, events, and focus sessions.',
  },
  {
    target: 'ambient-sounds',
    icon: '♪',
    title: 'Ambient Sounds',
    desc: 'Brown noise, rain, forest, ocean. Pick what helps you focus.',
    optional: true,
  },
  {
    target: 'contexts',
    icon: '◈',
    title: 'Contexts',
    desc: 'Tag tasks and events by context — Work, Health, Personal — to filter your view in one click.',
  },
  {
    // Last step has no anchor — it falls back to the centered card layout.
    target: '__shortcuts__',
    icon: '⌘',
    title: 'Keyboard Shortcuts',
    desc: 'Global: Ctrl+K Quick Capture, Ctrl+Z / Ctrl+Shift+Z Undo / Redo, then G then C/T/P/R/F/I to jump to Calendar, Tasks, Plan, Performance, Focus, Insights. On Calendar only: M/W/D Month/Week/Day, T today, N new event, F focus mode.',
    optional: true,
  },
];

const TOTAL = STEPS.length;
const PAD = 12;
const TOOLTIP_W = 300;
const SPRING = { type: 'spring' as const, damping: 30, stiffness: 280 };
const SPRING_SOFT = { type: 'spring' as const, damping: 34, stiffness: 200 };

/* ── Hook: track target element rect ─────────────────────────────── */

function useTargetRect(target: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!target) { setRect(null); return; }

    const update = () => {
      const el = document.querySelector(`[data-tutorial="${target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };

    const id = setTimeout(update, 80);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      clearTimeout(id);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [target]);

  return rect;
}

/* ── Tooltip position calculator ──────────────────────────────────── */

type ArrowSide = 'left' | 'right' | 'top' | 'bottom';

function getTooltipPos(
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  winW: number,
  winH: number,
): { left: number; top: number; arrow: ArrowSide } {
  const GAP = 20;
  const H_EST = 250;
  const clampY = (y: number) => Math.max(16, Math.min(y, winH - H_EST - 16));

  if (sx + sw + GAP + TOOLTIP_W < winW - 16)
    return { left: sx + sw + GAP, top: clampY(sy + sh / 2 - H_EST / 2), arrow: 'left' };
  if (sx - GAP - TOOLTIP_W > 16)
    return { left: sx - GAP - TOOLTIP_W, top: clampY(sy + sh / 2 - H_EST / 2), arrow: 'right' };
  if (sy + sh + GAP + H_EST < winH - 16)
    return {
      left: Math.max(16, Math.min(sx + sw / 2 - TOOLTIP_W / 2, winW - TOOLTIP_W - 16)),
      top: sy + sh + GAP,
      arrow: 'top',
    };
  return {
    left: Math.max(16, Math.min(sx + sw / 2 - TOOLTIP_W / 2, winW - TOOLTIP_W - 16)),
    top: Math.max(16, sy - H_EST - GAP),
    arrow: 'bottom',
  };
}

/* ── Arrow nub ────────────────────────────────────────────────────── */

function Arrow({ side }: { side: ArrowSide }) {
  const base = 'absolute w-[11px] h-[11px] bg-popover z-0';
  const variants: Record<ArrowSide, string> = {
    left: '-left-[5px] top-[36px] rotate-45 border-b border-l border-border/40',
    right: '-right-[5px] top-[36px] rotate-45 border-t border-r border-border/40',
    top: 'top-[-5px] left-1/2 -translate-x-1/2 rotate-45 border-t border-l border-border/40',
    bottom: 'bottom-[-5px] left-1/2 -translate-x-1/2 rotate-45 border-b border-r border-border/40',
  };
  return <div className={`${base} ${variants[side]}`} />;
}

/* ── Animated cursor ─────────────────────────────────────────────── */

const AnimatedCursor = ({ x, y }: { x: number; y: number }) => (
  <motion.div
    className="fixed z-[9993] pointer-events-none"
    style={{ width: 26, height: 26 }}
    initial={{ opacity: 0, scale: 0.5 }}
    animate={{ opacity: 1, scale: 1, left: x, top: y }}
    exit={{ opacity: 0, scale: 0.5 }}
    transition={{
      opacity: { duration: 0.2 },
      scale: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
      left: SPRING,
      top: SPRING,
    }}
  >
    <motion.div
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 1.8, ease: 'easeInOut' }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 20 20"
        fill="none"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
      >
        <path
          d="M3.5 1.5v15.2l3.3-3.3a1 1 0 0 1 .7-.3H15L3.5 1.5Z"
          fill="white"
          stroke="rgba(0,0,0,0.15)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
    </motion.div>
    <motion.div
      className="absolute rounded-full"
      style={{ top: 8, left: 6, border: '1.5px solid rgba(255,255,255,0.6)' }}
      animate={{ width: [4, 22], height: [4, 22], marginLeft: [-2, -11], marginTop: [-2, -11], opacity: [0.9, 0] }}
      transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 2.1, delay: 0.35, ease: 'easeOut' }}
    />
  </motion.div>
);

/* ── Tooltip card ────────────────────────────────────────────────── */

interface TooltipProps {
  step: TutorialStep;
  stepIndex: number;
  left: number;
  top: number;
  arrow: ArrowSide;
  onNext: () => void;
  onSkip: () => void;
}

const TooltipCard = ({ step, stepIndex, left, top, arrow, onNext, onSkip }: TooltipProps) => (
  <motion.div
    key={stepIndex}
    className="fixed z-[9992] pointer-events-auto"
    style={{ left, top, width: TOOLTIP_W }}
    initial={{
      opacity: 0,
      scale: 0.93,
      y: arrow === 'top' ? -10 : arrow === 'bottom' ? 10 : 0,
      x: arrow === 'left' ? -10 : arrow === 'right' ? 10 : 0,
    }}
    animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
    exit={{ opacity: 0, scale: 0.96 }}
    transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
  >
    <Arrow side={arrow} />

    <div
      className="relative rounded-2xl border border-border/50 bg-popover/95 shadow-lg overflow-hidden"
      style={{ backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)' }}
    >

      <div className="p-5">
        {/* Progress pills */}
        <div className="flex items-center gap-[3px] mb-4">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <motion.div
              key={i}
              className={`h-[3px] rounded-full transition-colors duration-300 ${
                i === stepIndex ? 'bg-primary' : i < stepIndex ? 'bg-primary/40' : 'bg-border'
              }`}
              animate={{ width: i === stepIndex ? 22 : 6 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}
          <span className="ml-auto text-[10px] font-mono text-muted-foreground/40 tabular-nums">
            {stepIndex + 1} / {TOTAL}
          </span>
        </div>

        <motion.div
          key={`title-${stepIndex}`}
          className="flex items-start gap-2.5 mb-2"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="mt-0.5 text-base leading-none text-primary/80 select-none" aria-hidden>
            {step.icon}
          </span>
          <h3 className="font-semibold text-[13.5px] leading-snug text-foreground">{step.title}</h3>
        </motion.div>

        <motion.p
          key={`desc-${stepIndex}`}
          className="text-[12px] leading-relaxed text-muted-foreground pl-[26px]"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14, duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          {step.desc}
        </motion.p>

        {step.hint && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.22 }}
            className="mt-2 ml-[26px]"
          >
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/60 border border-border/40 text-[10px] text-muted-foreground/60 font-medium">
              {step.hint}
            </span>
          </motion.div>
        )}

        <div className="mt-4 mb-3 h-px bg-border/40" />

        <div className="flex items-center justify-between">
          <button
            onClick={onSkip}
            className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors duration-150 font-medium"
          >
            Skip tour
          </button>
          <motion.button
            onClick={onNext}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 transition-opacity"
          >
            {stepIndex === TOTAL - 1 ? (
              <>Done <span aria-hidden>✓</span></>
            ) : (
              <>Next <span aria-hidden className="opacity-60">→</span></>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  </motion.div>
);

/* ── Tour notification prompt ─────────────────────────────────────── */

const TourPrompt = ({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) => (
  <motion.div
    className="fixed bottom-24 right-5 z-[9980] w-[300px] pointer-events-auto"
    initial={{ opacity: 0, y: 24, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 16, scale: 0.96 }}
    transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
  >
    <div
      className="rounded-2xl border border-border/50 bg-popover/95 shadow-lg overflow-hidden"
      style={{ backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)' }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-muted flex items-center justify-center text-foreground text-sm">
            ✦
          </div>
          <div>
            <p className="font-semibold text-[13px] text-foreground leading-snug">New to Lumina?</p>
            <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
              A quick walkthrough of the main features.
            </p>
          </div>
        </div>
        <div className="h-px bg-border/40 mb-3" />
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onDismiss}
            className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors font-medium"
          >
            Maybe later
          </button>
          <motion.button
            onClick={onStart}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-foreground text-background text-[12px] font-semibold hover:opacity-90 transition-opacity"
          >
            Show me around <span aria-hidden className="opacity-70">→</span>
          </motion.button>
        </div>
      </div>
    </div>
  </motion.div>
);

/* ── Floating tour trigger button (keep separate) ────────────────────────────────── */

const FloatingTourButton = ({
  onClick,
  onDismiss,
}: {
  onClick: () => void;
  onDismiss: () => void;
}) => (
  <motion.div
    className="fixed bottom-24 right-5 z-[9980] pointer-events-auto"
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.8 }}
    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
  >
    <div className="relative group">
      <motion.button
        onClick={onClick}
        className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 text-primary flex items-center justify-center shadow-md hover:bg-primary/20 transition-colors"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        title="Take a tour"
        aria-label="Take a tour of Lumina"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth={2.5} />
        </svg>
      </motion.button>
      {/* Permanent dismiss — visible on hover so the trigger doesn't haunt
          users forever once they've decided they don't want the tour. */}
      <button
        type="button"
        onClick={onDismiss}
        title="Hide tour"
        aria-label="Hide tour permanently"
        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-background border border-border text-muted-foreground hover:text-foreground hover:bg-muted shadow-sm flex items-center justify-center text-[10px] leading-none opacity-0 group-hover:opacity-100 transition-opacity"
      >
        ×
      </button>
    </div>
  </motion.div>
);

/* ── Main overlay ────────────────────────────────────────────────── */

export default function TutorialOverlay() {
  const {
    isActive, currentStep, nextStep, skipTutorial,
    hasCompletedTutorial, hasSeenPrompt,
    startTutorial, dismissPrompt,
  } = useTutorialStore();
  // Reusing skipTutorial so the floating button can be permanently dismissed
  // without requiring the user to walk through every step.
  const dismissTour = skipTutorial;

  const step = STEPS[currentStep];
  const rawRect = useTargetRect(isActive && step ? step.target : null);

  // Retain last valid rect so spotlight doesn't vanish mid-transition
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (rawRect) setRect(rawRect);
  }, [rawRect]);

  const handleNext = useCallback(() => nextStep(TOTAL), [nextStep]);

  // Auto-advance optional steps whose target element isn't found after 1.5s
  useEffect(() => {
    if (!isActive || !step?.optional) return;
    if (rawRect) return; // element found — no need to skip
    const id = setTimeout(() => {
      if (!rawRect) handleNext();
    }, 1500);
    return () => clearTimeout(id);
  }, [isActive, step, rawRect, handleNext]);

  // Keyboard: → / Enter = next, Escape = skip
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext();
      if (e.key === 'Escape') skipTutorial();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActive, handleNext, skipTutorial]);

  const winW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800;

  // ── Notification prompt & floating button (not active, not completed) ──
  if (!isActive) {
    if (hasCompletedTutorial) return null;
    return (
      <AnimatePresence>
        {!hasSeenPrompt ? (
          <TourPrompt key="tour-prompt" onStart={startTutorial} onDismiss={dismissPrompt} />
        ) : (
          <FloatingTourButton key="tour-btn" onClick={startTutorial} onDismiss={dismissTour} />
        )}
      </AnimatePresence>
    );
  }

  if (!rect) return null;

  const sx = rect.left - PAD;
  const sy = rect.top - PAD;
  const sw = rect.width + PAD * 2;
  const sh = rect.height + PAD * 2;

  const { left: tipLeft, top: tipTop, arrow } = getTooltipPos(sx, sy, sw, sh, winW, winH);
  const cursorX = sx + sw - 16;
  const cursorY = sy + sh - 16;

  // Four surrounding rects — block clicks everywhere EXCEPT the spotlight area
  const blockers = [
    { left: 0, top: 0, width: winW, height: sy },
    { left: 0, top: sy, width: sx, height: sh },
    { left: sx + sw, top: sy, width: Math.max(0, winW - (sx + sw)), height: sh },
    { left: 0, top: sy + sh, width: winW, height: Math.max(0, winH - (sy + sh)) },
  ];

  return (
    <>
      {/* Surrounding click blockers — spotlight area remains fully interactive */}
      {blockers.map((b, i) => (
        <div
          key={i}
          className="fixed z-[9988]"
          style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
        />
      ))}

      {/* SVG spotlight — SVG mask guarantees a clean cutout in all browsers */}
      <motion.svg
        className="fixed inset-0 z-[9990] pointer-events-none"
        style={{ position: 'fixed', top: 0, left: 0 }}
        width={winW}
        height={winH}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <defs>
          <mask id="tutorial-spotlight-mask">
            <rect width={winW} height={winH} fill="white" />
            <motion.rect
              rx={14}
              ry={14}
              animate={{ x: sx, y: sy, width: sw, height: sh }}
              transition={SPRING_SOFT}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width={winW}
          height={winH}
          fill="rgba(0, 0, 0, 0.76)"
          mask="url(#tutorial-spotlight-mask)"
        />
      </motion.svg>

      {/* Tooltip card */}
      <AnimatePresence mode="wait">
        <TooltipCard
          key={currentStep}
          step={step}
          stepIndex={currentStep}
          left={tipLeft}
          top={tipTop}
          arrow={arrow}
          onNext={handleNext}
          onSkip={skipTutorial}
        />
      </AnimatePresence>

      {/* Animated cursor */}
      <AnimatePresence>
        <AnimatedCursor key={`cursor-${currentStep}`} x={cursorX} y={cursorY} />
      </AnimatePresence>
    </>
  );
}
