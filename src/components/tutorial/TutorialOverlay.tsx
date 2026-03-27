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
}

const STEPS: TutorialStep[] = [
  {
    target: 'new-entry',
    icon: '✦',
    title: 'Create Anything, Instantly',
    desc: 'Add an event, task, or note in a single click — the fastest path from thought to action.',
    hint: 'Shortcut: N',
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
const PAD = 12;
const TOOLTIP_W = 300;
const SPRING = { type: 'spring' as const, damping: 30, stiffness: 280 };
const SPRING_SOFT = { type: 'spring' as const, damping: 34, stiffness: 200 };

/* ── Hook: track target element rect ─────────────────────────────── */

function useTargetRect(target: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!target) return;
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
        style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5)) drop-shadow(0 0 3px rgba(109,89,224,0.5))' }}
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

    {/* Click ripple */}
    <motion.div
      className="absolute rounded-full"
      style={{ top: 8, left: 6, border: '1.5px solid rgba(255,255,255,0.6)' }}
      animate={{
        width: [4, 22], height: [4, 22],
        marginLeft: [-2, -11], marginTop: [-2, -11],
        opacity: [0.9, 0],
      }}
      transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 2.1, delay: 0.35, ease: 'easeOut' }}
    />
  </motion.div>
);

/* ── Beacon pulse ring ───────────────────────────────────────────── */

const BeaconRing = ({ sx, sy, sw, sh }: { sx: number; sy: number; sw: number; sh: number }) => (
  <motion.div
    className="fixed pointer-events-none z-[9991]"
    animate={{ left: sx, top: sy, width: sw, height: sh }}
    transition={SPRING}
    style={{ borderRadius: 14 }}
  >
    {/* Solid primary border + glow */}
    <div
      className="absolute inset-0 rounded-[14px]"
      style={{ boxShadow: '0 0 0 1.5px rgba(109,89,224,0.9), 0 0 28px 5px rgba(109,89,224,0.18)' }}
    />

    {/* Pulsing ring 1 */}
    <motion.div
      className="absolute rounded-[14px]"
      style={{ inset: -4, border: '2px solid rgba(109,89,224,0.45)' }}
      animate={{ scale: [1, 1.08], opacity: [0.65, 0] }}
      transition={{ duration: 1.9, repeat: Infinity, ease: 'easeOut', repeatDelay: 0.4 }}
    />

    {/* Pulsing ring 2 — staggered */}
    <motion.div
      className="absolute rounded-[14px]"
      style={{ inset: -8, border: '1.5px solid rgba(109,89,224,0.2)' }}
      animate={{ scale: [1, 1.12], opacity: [0.4, 0] }}
      transition={{ duration: 1.9, repeat: Infinity, ease: 'easeOut', repeatDelay: 0.4, delay: 0.28 }}
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
      className="relative rounded-2xl border border-border/50 bg-popover/95 shadow-2xl overflow-hidden"
      style={{ backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)' }}
    >
      {/* Accent stripe */}
      <div className="h-[2px] bg-gradient-to-r from-primary via-primary/60 to-transparent" />

      <div className="p-5">
        {/* Progress pills + counter */}
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

        {/* Icon + title — staggered in */}
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
          <h3 className="font-semibold text-[13.5px] leading-snug text-foreground">
            {step.title}
          </h3>
        </motion.div>

        {/* Description */}
        <motion.p
          key={`desc-${stepIndex}`}
          className="text-[12px] leading-relaxed text-muted-foreground pl-[26px]"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14, duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          {step.desc}
        </motion.p>

        {/* Optional hint badge */}
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

/* ── Main overlay ────────────────────────────────────────────────── */

export default function TutorialOverlay() {
  const { isActive, currentStep, nextStep, skipTutorial } = useTutorialStore();

  const step = STEPS[currentStep];
  const rawRect = useTargetRect(isActive && step ? step.target : null);

  // Retain last valid rect so spotlight doesn't vanish on step change
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (rawRect) setRect(rawRect);
  }, [rawRect]);

  const handleNext = useCallback(() => nextStep(TOTAL), [nextStep]);

  // Keyboard shortcuts: → / Enter = next, Escape = skip
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext();
      if (e.key === 'Escape') skipTutorial();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActive, handleNext, skipTutorial]);

  if (!isActive || !rect) return null;

  const winW = window.innerWidth;
  const winH = window.innerHeight;

  const sx = rect.left - PAD;
  const sy = rect.top - PAD;
  const sw = rect.width + PAD * 2;
  const sh = rect.height + PAD * 2;

  const { left: tipLeft, top: tipTop, arrow } = getTooltipPos(sx, sy, sw, sh, winW, winH);
  const cursorX = sx + sw - 16;
  const cursorY = sy + sh - 16;

  return (
    <>
      {/* Interaction blocker — prevents clicks reaching the app */}
      <div className="fixed inset-0 z-[9988]" />

      {/*
        SVG spotlight overlay — reliable cross-browser spotlight via mask.
        The mask is white everywhere (visible) except the animated black rect
        (transparent), creating a precise cutout at the target element.
      */}
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

      {/* Beacon ring tracks spotlight position */}
      <BeaconRing sx={sx} sy={sy} sw={sw} sh={sh} />

      {/* Tooltip card — re-mounts on step change for enter/exit animation */}
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

      {/* Animated cursor — springs to target element corner */}
      <AnimatePresence>
        <AnimatedCursor key={`cursor-${currentStep}`} x={cursorX} y={cursorY} />
      </AnimatePresence>
    </>
  );
}
