'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { MockupFrame } from './MockupFrame';
import { DARK, ACCENT } from './tokens';

export function FocusMockup({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  // Ring geometry
  const R = 46;
  const C = 2 * Math.PI * R;
  const progress = 0.68; // 68% complete

  return (
    <MockupFrame title="focus · pomodoro">
      <div
        className="w-full h-full flex flex-col items-center justify-center gap-3 p-4"
        style={{ background: DARK.bg }}
      >
        {/* Ring timer */}
        <div className="relative">
          <svg width="130" height="130" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={DARK.borderSubtle}
              strokeWidth="4"
            />
            <motion.circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={ACCENT.rose}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={C}
              initial={{ strokeDashoffset: C }}
              animate={{
                strokeDashoffset: active ? C * (1 - progress) : C,
              }}
              transition={{
                duration: reduce ? 0 : 1.4,
                delay: reduce ? 0 : 0.2,
                ease: [0.16, 1, 0.3, 1],
              }}
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div
              className="font-mono text-xl md:text-2xl font-medium tabular-nums"
              style={{ color: DARK.text }}
            >
              16:42
            </div>
            <div
              className="text-[9px] font-mono uppercase tracking-wider mt-0.5"
              style={{ color: DARK.textMuted }}
            >
              Focus
            </div>
          </div>
        </div>

        {/* Session pills */}
        <div className="flex items-center gap-1.5">
          {[true, true, false, false].map((done, i) => (
            <motion.span
              key={i}
              className="w-5 h-1 rounded-full"
              style={{
                background: done ? ACCENT.rose : DARK.borderSubtle,
              }}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={active ? { opacity: 1, scale: 1 } : { opacity: 0 }}
              transition={{
                duration: reduce ? 0 : 0.3,
                delay: reduce ? 0 : 0.5 + i * 0.08,
              }}
            />
          ))}
        </div>

        {/* Streak */}
        <div
          className="flex items-center gap-1.5 text-[10px] font-mono"
          style={{ color: DARK.textMuted }}
        >
          <span>🔥</span>
          <span>12-day streak</span>
        </div>
      </div>
    </MockupFrame>
  );
}
