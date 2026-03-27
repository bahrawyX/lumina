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
}

const STEPS: TutorialStep[] = [
  {
    target: 'new-entry',
    icon: '✦',
    title: 'Create Anything, Instantly',
    desc: 'Add an event, task, or note in a single click — the fastest path from thought to action.',
  },
  {
    target: 'ignite-flow',
    icon: '⚡',
    title: 'Ignite Your Flow State',
    desc: 'Start a focused work session. Lumina tracks every minute and builds your streak automatically.',
  },
  {
    target: 'nav-calendar',
    icon: '🗓',
    title: 'Your Calendar',
    desc: 'Month, week, and day views in one place. Drag events to instantly reschedule anything.',
  },
  {
    target: 'nav-intelligence',
    icon: '✦',
    title: 'Intelligence',
    desc: 'AI insights that learn your patterns and suggest smarter ways to structure your week.',
  },
  {
    target: 'nav-tasks',
    icon: '▦',
    title: 'Task Board',
    desc: 'Kanban-style board for everything on your list. Move cards through To Do → Doing → Done.',
  },
  {
    target: 'nav-plan',
    icon: '◎',
    title: 'Plan Your Day',
    desc: 'Pull tasks from your backlog and drop them into your calendar to build a realistic daily schedule.',
  },
  {
    target: 'nav-performance',
    icon: '↑',
    title: 'Performance',
    desc: 'Track focus streaks, deep-work hours, and productivity trends over time.',
  },
  {
    target: 'contexts',
    icon: '◈',
    title: 'Contexts',
    desc: 'Tag everything by context — Work, Health, Personal — to filter your view in one click.',
  },
];

const TOTAL = STEPS.length;
const PAD = 10;
const TOOLTIP_W = 280;
const SPRING = { type: 'spring' as const, damping: 30, stiffness: 280 };
const SPRING_SOFT = { type: 'spring' as const, damping: 34, stiffness: 240 };

/* ── Hook: track element bounding rect ───────────────────────────── */

function useTargetRect(target: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!target) return;

    const update = () => {
      const el = document.querySelector(`[data-tutorial="${target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };

    const id = setTimeout(update, 60);
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

/* ── Animated cursor ─────────────────────────────────────────────── */

const AnimatedCursor: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <motion.div
    className="fixed z-[9993] pointer-events-none"
    style={{ width: 26, height: 26 }}
    initial={{ opacity: 0, scale: 0.5 }}
    animate={{ opacity: 1, scale: 1, left: x, top: y }}
    exit={{ opacity: 0, scale: 0.5 }}
    transition={{
      opacity: { duration: 0.18 },
      scale: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
      left: SPRING,
      top: SPRING,
    }}
  >
    {/* Cursor — subtle drop shadow so it's visible in both themes */}
    <motion.div
      animate={{ y: [0, -5, 0] }}
      transition={{ duration: 1.3, repeat: Infinity, repeatDelay: 1.6, ease: 'easeInOut' }}
    >
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))' }}>
        <path
          d="M3.5 1.5v15.2l3.3-3.3a1 1 0 0 1 .7-.3H15L3.5 1.5Z"
          fill="white"
          stroke="rgba(0,0,0,0.18)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
    </motion.div>

    {/* Click ripple — tight, fast, synced with cursor bounce */}
    <motion.div
      className="absolute rounded-full"
      style={{ top: 8, left: 6, border: '1.5px solid rgba(255,255,255,0.55)' }}
      animate={{ width: [4, 20], height: [4, 20], marginLeft: [-2, -10], marginTop: [-2, -10], opacity: [0.9, 0] }}
      transition={{ duration: 1.0, repeat: Infinity, repeatDelay: 1.9, delay: 0.3, ease: 'easeOut' }}
    />
  </motion.div>
);

/* ── Beacon pulse ring around spotlight ──────────────────────────── */

const BeaconRing: React.FC<{ sx: number; sy: number; sw: number; sh: number }> = ({ sx, sy, sw, sh }) => (
  <motion.div
    className="fixed pointer-events-none z-[9991]"
    animate={{ left: sx, top: sy, width: sw, height: sh }}
    transition={SPRING}
    style={{ borderRadius: 14 }}
  >
    {/* Static primary border */}
    <div className="absolute inset-0 rounded-[14px]" style={{ boxShadow: '0 0 0 1.5px rgba(109,89,224,0.85)' }} />

    {/* Outer glow */}
    <div className="absolute inset-0 rounded-[14px]" style={{ boxShadow: '0 0 20px 2px rgba(109,89,224,0.12)' }} />

    {/* Pulsing beacon ring */}
    <motion.div
      className="absolute rounded-[14px]"
      style={{ inset: -1, boxShadow: '0 0 0 2px rgba(109,89,224,0.5)' }}
      animate={{ scale: [1, 1.06], opacity: [0.55, 0] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', repeatDelay: 0.5 }}
    />
  </motion.div>
);

/* ── Tooltip card ────────────────────────────────────────────────── */

interface TooltipCardProps {
  step: TutorialStep;
  stepIndex: number;
  left: number;
  top: number;
  onNext: () => void;
  onSkip: () => void;
}

const TooltipCard: React.FC<TooltipCardProps> = ({ step, stepIndex, left, top, onNext, onSkip }) => (
  <motion.div
    key={stepIndex}
    className="fixed z-[9992] pointer-events-auto select-none"
    style={{ left, top, width: TOOLTIP_W }}
    initial={{ opacity: 0, x: -16, scale: 0.96 }}
    animate={{ opacity: 1, x: 0, scale: 1 }}
    exit={{ opacity: 0, x: -10, scale: 0.97 }}
    transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
  >
    {/* Adaptive arrow — rotated square, left-pointing */}
    <div
      className="absolute w-[11px] h-[11px] -left-[5px] top-[34px] rotate-45 bg-popover border-b border-l border-border/40 z-0"
    />

    {/* Card */}
    <div className="relative z-[1] rounded-2xl border border-border/50 bg-popover/95 shadow-xl dark:shadow-2xl shadow-black/10 dark:shadow-black/50 overflow-hidden"
      style={{ backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)' }}
    >
      {/* Accent stripe at top */}
      <div className="h-[2px] bg-gradient-to-r from-primary/80 via-primary/40 to-transparent" />

      <div className="p-5">
        {/* Progress bar row */}
        <div className="flex items-center gap-1 mb-4">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <motion.div
              key={i}
              className={`h-[3px] rounded-full ${
                i === stepIndex
                  ? 'bg-primary'
                  : i < stepIndex
                  ? 'bg-primary/40'
                  : 'bg-border'
              }`}
              animate={{ width: i === stepIndex ? 20 : 6 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}
          <span className="ml-auto text-[10px] font-mono tabular-nums text-muted-foreground/50 leading-none">
            {stepIndex + 1}/{TOTAL}
          </span>
        </div>

        {/* Icon + title */}
        <div className="flex items-start gap-2.5 mb-2">
          <span className="mt-px text-base leading-none select-none text-primary/80" aria-hidden>
            {step.icon}
          </span>
          <h3 className="font-semibold text-[13.5px] leading-snug text-foreground">
            {step.title}
          </h3>
        </div>

        {/* Description */}
        <p className="text-[12px] leading-relaxed text-muted-foreground pl-[26px]">
          {step.desc}
        </p>

        {/* Divider */}
        <div className="mt-4 mb-3 h-px bg-border/40" />

        {/* Actions */}
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
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-[12px] font-semibold transition-opacity hover:opacity-90"
          >
            {stepIndex === TOTAL - 1 ? (
              <>Done <span aria-hidden>✓</span></>
            ) : (
              <>Next <span aria-hidden className="text-primary-foreground/70">→</span></>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  </motion.div>
);

/* ── Main overlay ────────────────────────────────────────────────── */

export default function TutorialOverlay() {
  const { isActive, currentStep, nextStep, skipTutorial } = useTutorialStore();

  const step = STEPS[currentStep];
  const rawRect = useTargetRect(isActive && step ? step.target : null);

  // Retain last valid rect so spotlight doesn't blink on step change
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (rawRect) setRect(rawRect);
  }, [rawRect]);

  const handleNext = useCallback(() => nextStep(TOTAL), [nextStep]);

  if (!isActive) return null;
  if (!rect) return null;

  const sx = rect.left - PAD;
  const sy = rect.top - PAD;
  const sw = rect.width + PAD * 2;
  const sh = rect.height + PAD * 2;

  const cursorX = rect.right - 14;
  const cursorY = rect.bottom - 14;

  const GAP = 22;
  const tipLeft = sx + sw + GAP;
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const tipTop = Math.max(16, Math.min(sy + sh / 2 - 100, winH - 240));

  return (
    <>
      {/* Full-screen click blocker — stops accidental background interaction */}
      <div className="fixed inset-0 z-[9988]" />

      {/* Dark scrim — always dark in both themes to create contrast */}
      <motion.div
        className="fixed inset-0 z-[9990] pointer-events-none"
        style={{
          isolation: 'isolate',
          background: 'rgba(0, 0, 0, 0.72)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        {/* destination-out punch-out creates the transparent spotlight hole */}
        <motion.div
          className="absolute"
          style={{
            background: 'black',
            mixBlendMode: 'destination-out' as React.CSSProperties['mixBlendMode'],
            borderRadius: 14,
          }}
          animate={{ left: sx, top: sy, width: sw, height: sh }}
          transition={SPRING_SOFT}
        />
      </motion.div>

      {/* Beacon ring — animated, primary color, tracks spotlight */}
      <BeaconRing sx={sx} sy={sy} sw={sw} sh={sh} />

      {/* Tooltip card */}
      <AnimatePresence mode="wait">
        <TooltipCard
          key={currentStep}
          step={step}
          stepIndex={currentStep}
          left={tipLeft}
          top={tipTop}
          onNext={handleNext}
          onSkip={skipTutorial}
        />
      </AnimatePresence>

      {/* Cursor */}
      <AnimatePresence>
        <AnimatedCursor key={`cursor-${currentStep}`} x={cursorX} y={cursorY} />
      </AnimatePresence>
    </>
  );
}
