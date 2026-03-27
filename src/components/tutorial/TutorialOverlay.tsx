'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTutorialStore } from '@/store/useTutorialStore';

/* ── Step definitions ─────────────────────────────────────────────── */

interface TutorialStep {
  target: string;
  title: string;
  desc: string;
}

const STEPS: TutorialStep[] = [
  {
    target: 'new-entry',
    title: 'Create Anything, Instantly',
    desc: 'Add an event, task, or note in a single click — the fastest path from thought to action.',
  },
  {
    target: 'ignite-flow',
    title: 'Ignite Your Flow State',
    desc: 'Start a focused work session. Lumina tracks every minute and builds your streak automatically.',
  },
  {
    target: 'nav-calendar',
    title: 'Your Calendar',
    desc: 'Month, week, and day views in one place. Drag events to instantly reschedule anything.',
  },
  {
    target: 'nav-intelligence',
    title: 'Intelligence',
    desc: 'AI insights that learn your patterns and suggest smarter ways to structure your week.',
  },
  {
    target: 'nav-tasks',
    title: 'Task Board',
    desc: 'Kanban-style board for everything you need to do. Drag cards through To Do → Doing → Done.',
  },
  {
    target: 'nav-plan',
    title: 'Plan Your Day',
    desc: 'Pull tasks from your backlog and drop them into your calendar to build a realistic daily schedule.',
  },
  {
    target: 'nav-performance',
    title: 'Performance',
    desc: 'Track focus streaks, deep-work hours, and productivity trends over time.',
  },
  {
    target: 'contexts',
    title: 'Contexts',
    desc: 'Tag events and tasks by context — Work, Health, Personal — to filter your view instantly.',
  },
];

const TOTAL = STEPS.length;
const PAD = 10;
const TOOLTIP_W = 284;
const SPRING = { type: 'spring' as const, damping: 28, stiffness: 260 };

/* ── Hook: track element bounding rect ───────────────────────────── */

function useTargetRect(target: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!target) return;

    const update = () => {
      const el = document.querySelector(`[data-tutorial="${target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };

    // Small delay so DOM is fully rendered after step change
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
    style={{ width: 24, height: 24 }}
    initial={{ opacity: 0, scale: 0.6 }}
    animate={{ opacity: 1, scale: 1, left: x, top: y }}
    exit={{ opacity: 0, scale: 0.6 }}
    transition={{
      opacity: { duration: 0.2 },
      scale: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
      left: SPRING,
      top: SPRING,
    }}
  >
    {/* Cursor icon — bounces to hint at clicking */}
    <motion.div
      animate={{ y: [0, -4, 0] }}
      transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1.4, ease: 'easeInOut' }}
    >
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
        <path
          d="M3.5 1.5v15.2l3.3-3.3a1 1 0 0 1 .7-.3H15L3.5 1.5Z"
          fill="white"
          stroke="rgba(0,0,0,0.3)"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </svg>
    </motion.div>

    {/* Ripple ring on each "tap" */}
    <motion.div
      className="absolute rounded-full border-[1.5px] border-white/60"
      style={{ top: 8, left: 6 }}
      animate={{
        width: [6, 22],
        height: [6, 22],
        marginLeft: [-3, -11],
        marginTop: [-3, -11],
        opacity: [0.8, 0],
      }}
      transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 1.5, delay: 0.25, ease: 'easeOut' }}
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
    initial={{ opacity: 0, x: -14, scale: 0.97 }}
    animate={{ opacity: 1, x: 0, scale: 1 }}
    exit={{ opacity: 0, x: -8, scale: 0.98 }}
    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
  >
    {/* Arrow pointing left toward spotlight */}
    <div
      className="absolute"
      style={{
        left: -9,
        top: 34,
        borderTop: '8px solid transparent',
        borderBottom: '8px solid transparent',
        borderRight: '9px solid rgba(17,17,22,0.97)',
      }}
    />

    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(17,17,22,0.97)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(24px)',
      }}
    >
      <div className="p-5">
        {/* Progress pills */}
        <div className="flex items-center gap-1 mb-4">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <motion.div
              key={i}
              className="h-[3px] rounded-full"
              animate={{
                width: i === stepIndex ? 18 : 5,
                backgroundColor:
                  i < stepIndex
                    ? 'rgba(109,89,224,0.5)'
                    : i === stepIndex
                    ? 'rgba(109,89,224,1)'
                    : 'rgba(255,255,255,0.12)',
              }}
              transition={{ duration: 0.22 }}
            />
          ))}
          <span className="ml-auto text-[10px] font-mono tabular-nums" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {stepIndex + 1} / {TOTAL}
          </span>
        </div>

        {/* Content */}
        <h3 className="font-semibold text-[13.5px] leading-snug mb-1.5" style={{ color: 'rgba(255,255,255,0.95)' }}>
          {step.title}
        </h3>
        <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.48)' }}>
          {step.desc}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={onSkip}
            className="text-[11px] transition-colors duration-150"
            style={{ color: 'rgba(255,255,255,0.25)' }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.25)'; }}
          >
            Skip tour
          </button>

          <motion.button
            onClick={onNext}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="px-4 py-1.5 rounded-xl text-[12px] font-semibold text-white"
            style={{ background: 'rgba(109,89,224,1)' }}
          >
            {stepIndex === TOTAL - 1 ? 'Done ✓' : 'Next →'}
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

  // Keep last valid rect so the spotlight doesn't jump to null during transition
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

  // Cursor: bottom-right corner of spotlight, pointing at the element
  const cursorX = rect.right - 12;
  const cursorY = rect.bottom - 12;

  // Tooltip: right of sidebar spotlight with a small gap
  const GAP = 24;
  const tipLeft = sx + sw + GAP;
  const tipTop = Math.max(16, Math.min(sy + sh / 2 - 96, window.innerHeight - 230));

  return (
    <>
      {/* Click blocker — absorbs all background clicks */}
      <div className="fixed inset-0 z-[9988]" />

      {/* Dark overlay with mix-blend-mode hole for the spotlight */}
      <motion.div
        className="fixed inset-0 z-[9990] pointer-events-none"
        style={{ isolation: 'isolate', background: 'rgba(0,0,0,0.78)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28 }}
      >
        <motion.div
          className="absolute"
          style={{ background: 'black', mixBlendMode: 'destination-out' as React.CSSProperties['mixBlendMode'], borderRadius: 14 }}
          animate={{ left: sx, top: sy, width: sw, height: sh }}
          transition={SPRING}
        />
      </motion.div>

      {/* Spotlight glow ring */}
      <motion.div
        className="fixed pointer-events-none z-[9991]"
        style={{
          borderRadius: 14,
          boxShadow: '0 0 0 1.5px rgba(109,89,224,0.8), 0 0 28px rgba(109,89,224,0.2)',
        }}
        animate={{ left: sx, top: sy, width: sw, height: sh }}
        transition={SPRING}
      />

      {/* Tooltip */}
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
        <AnimatedCursor key={currentStep} x={cursorX} y={cursorY} />
      </AnimatePresence>
    </>
  );
}
