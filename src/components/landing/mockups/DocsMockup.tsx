'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { MockupFrame } from './MockupFrame';
import { DARK, ACCENT } from './tokens';

type Block =
  | { kind: 'h1'; text: string }
  | { kind: 'p'; width: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'task'; text: string; done: boolean }
  | { kind: 'quote'; text: string };

const BLOCKS: Block[] = [
  { kind: 'h1', text: 'Q2 Planning' },
  { kind: 'p', width: '94%' },
  { kind: 'p', width: '78%' },
  { kind: 'bullet', text: 'Ship snap-scroll showcase' },
  { kind: 'bullet', text: 'Rework focus analytics' },
  { kind: 'task', text: 'Draft launch tweet', done: true },
  { kind: 'task', text: 'Schedule design review', done: false },
  { kind: 'quote', text: 'Make it obvious. Then make it fast.' },
];

export function DocsMockup({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  return (
    <MockupFrame title="docs · Q2 planning">
      <div
        className="w-full h-full p-4 md:p-5 flex flex-col gap-2 overflow-hidden"
        style={{ background: DARK.bg }}
      >
        {BLOCKS.map((b, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
            transition={{
              duration: reduce ? 0 : 0.3,
              delay: reduce ? 0 : 0.1 + i * 0.06,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {b.kind === 'h1' && (
              <div
                className="font-semibold text-sm md:text-base"
                style={{ color: DARK.text }}
              >
                {b.text}
              </div>
            )}
            {b.kind === 'p' && (
              <div
                className="h-2 rounded-sm"
                style={{
                  width: b.width,
                  background: DARK.surfaceElevated,
                }}
              />
            )}
            {b.kind === 'bullet' && (
              <div className="flex items-center gap-2">
                <span
                  className="w-1 h-1 rounded-full flex-shrink-0"
                  style={{ background: DARK.textMuted }}
                />
                <span
                  className="text-[10px] md:text-[11px]"
                  style={{ color: DARK.text }}
                >
                  {b.text}
                </span>
              </div>
            )}
            {b.kind === 'task' && (
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-sm flex items-center justify-center flex-shrink-0"
                  style={{
                    background: b.done ? ACCENT.emerald : 'transparent',
                    border: `1px solid ${b.done ? ACCENT.emerald : DARK.border}`,
                  }}
                >
                  {b.done ? (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4L3 5.5L6.5 2" stroke={DARK.bg} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </span>
                <span
                  className="text-[10px] md:text-[11px]"
                  style={{
                    color: b.done ? DARK.textMuted : DARK.text,
                    textDecoration: b.done ? 'line-through' : 'none',
                  }}
                >
                  {b.text}
                </span>
              </div>
            )}
            {b.kind === 'quote' && (
              <div
                className="pl-2 text-[10px] md:text-[11px] italic"
                style={{
                  borderLeft: `2px solid ${ACCENT.violet}`,
                  color: DARK.textMuted,
                }}
              >
                {b.text}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </MockupFrame>
  );
}
