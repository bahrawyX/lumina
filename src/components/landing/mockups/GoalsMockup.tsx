'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { MockupFrame } from './MockupFrame';
import { DARK, ACCENT } from './tokens';

const GOALS = [
  { title: 'Ship landing page', progress: 0.82, color: ACCENT.violet },
  { title: 'Read 12 books', progress: 0.58, color: ACCENT.emerald },
  { title: 'Run 100km', progress: 0.44, color: ACCENT.amber },
  { title: 'Launch podcast', progress: 0.25, color: ACCENT.sky },
];

export function GoalsMockup({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  return (
    <MockupFrame title="goals · Q2">
      <div
        className="w-full h-full p-4 flex flex-col gap-3"
        style={{ background: DARK.bg }}
      >
        {GOALS.map((g, i) => (
          <motion.div
            key={g.title}
            className="flex flex-col gap-1.5"
            initial={{ opacity: 0, y: 8 }}
            animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={{
              duration: reduce ? 0 : 0.35,
              delay: reduce ? 0 : 0.1 + i * 0.1,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <div className="flex items-baseline justify-between">
              <span
                className="text-[10px] md:text-[11px] font-medium"
                style={{ color: DARK.text }}
              >
                {g.title}
              </span>
              <span
                className="text-[9px] md:text-[10px] font-mono tabular-nums"
                style={{ color: g.color }}
              >
                {Math.round(g.progress * 100)}%
              </span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: DARK.surface }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: g.color, transformOrigin: 'left' }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: active ? g.progress : 0 }}
                transition={{
                  duration: reduce ? 0 : 0.8,
                  delay: reduce ? 0 : 0.3 + i * 0.1,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </MockupFrame>
  );
}
