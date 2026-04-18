'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { MockupFrame } from './MockupFrame';
import { DARK, ACCENT } from './tokens';

const SLOTS = [
  { time: '08:00', label: 'Deep work — spec', color: ACCENT.violet, soft: ACCENT.violetSoft, span: 2 },
  { time: '10:00', label: 'Standup', color: ACCENT.emerald, soft: ACCENT.emeraldSoft, span: 1 },
  { time: '11:00', label: 'Review PRs', color: ACCENT.sky, soft: ACCENT.skySoft, span: 1 },
  { time: '12:00', label: null, color: null, soft: null, span: 1 },
  { time: '13:00', label: 'Design sync', color: ACCENT.amber, soft: ACCENT.amberSoft, span: 1 },
  { time: '14:00', label: 'Focus session', color: ACCENT.rose, soft: ACCENT.roseSoft, span: 2 },
];

export function PlannerMockup({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  return (
    <MockupFrame title="planner · today">
      <div className="w-full h-full p-3 md:p-4" style={{ background: DARK.bg }}>
        <div className="flex flex-col gap-1.5">
          {SLOTS.map((s, i) => (
            <motion.div
              key={i}
              className="flex items-stretch gap-2"
              initial={{ opacity: 0, x: -12 }}
              animate={active ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
              transition={{
                duration: reduce ? 0 : 0.35,
                delay: reduce ? 0 : 0.08 + i * 0.06,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <div
                className="text-[9px] md:text-[10px] font-mono w-10 flex-shrink-0 pt-1"
                style={{ color: DARK.textMuted }}
              >
                {s.time}
              </div>
              {s.label ? (
                <div
                  className="flex-1 rounded-md px-2 py-1.5 text-[9px] md:text-[10px] font-medium"
                  style={{
                    background: s.soft ?? 'transparent',
                    borderLeft: `2px solid ${s.color}`,
                    color: s.color ?? DARK.text,
                    minHeight: `${s.span * 18}px`,
                  }}
                >
                  {s.label}
                </div>
              ) : (
                <div
                  className="flex-1 rounded-md"
                  style={{
                    border: `1px dashed ${DARK.borderSubtle}`,
                    minHeight: '18px',
                  }}
                />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </MockupFrame>
  );
}
