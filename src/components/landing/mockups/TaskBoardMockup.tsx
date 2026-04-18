'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { MockupFrame } from './MockupFrame';
import { DARK, ACCENT } from './tokens';

type Col = {
  title: string;
  color: string;
  tasks: { label: string; checked?: boolean }[];
};

const COLUMNS: Col[] = [
  {
    title: 'Todo',
    color: ACCENT.sky,
    tasks: [
      { label: 'Draft Q2 roadmap' },
      { label: 'Review PR #482' },
      { label: 'Onboarding doc' },
    ],
  },
  {
    title: 'In progress',
    color: ACCENT.amber,
    tasks: [{ label: 'Snap scroll showcase' }, { label: 'Fix sheet z-index' }],
  },
  {
    title: 'Done',
    color: ACCENT.emerald,
    tasks: [
      { label: 'Ship OG image', checked: true },
      { label: 'Remove remotion', checked: true },
    ],
  },
];

export function TaskBoardMockup({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  return (
    <MockupFrame title="tasks · kanban">
      <div
        className="w-full h-full p-3 md:p-4 grid grid-cols-3 gap-2 md:gap-3"
        style={{ background: DARK.bg }}
      >
        {COLUMNS.map((col, ci) => (
          <div key={col.title} className="flex flex-col gap-2 min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: col.color }}
              />
              <span
                className="text-[9px] md:text-[10px] font-mono uppercase tracking-wider"
                style={{ color: DARK.textMuted }}
              >
                {col.title}
              </span>
              <span
                className="ml-auto text-[9px] font-mono"
                style={{ color: DARK.textSubtle }}
              >
                {col.tasks.length}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {col.tasks.map((t, ti) => (
                <motion.div
                  key={ti}
                  className="rounded-md px-2 py-1.5 text-[9px] md:text-[10px] leading-tight"
                  style={{
                    background: DARK.surface,
                    border: `1px solid ${DARK.borderSubtle}`,
                    color: t.checked ? DARK.textMuted : DARK.text,
                    textDecoration: t.checked ? 'line-through' : 'none',
                  }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                  transition={{
                    duration: reduce ? 0 : 0.35,
                    delay: reduce ? 0 : 0.1 + (ci * 3 + ti) * 0.05,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  <div className="flex items-start gap-1.5">
                    <span
                      className="mt-0.5 w-2.5 h-2.5 rounded-sm flex-shrink-0 flex items-center justify-center"
                      style={{
                        background: t.checked ? col.color : 'transparent',
                        border: `1px solid ${t.checked ? col.color : DARK.border}`,
                      }}
                    >
                      {t.checked ? (
                        <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4L3 5.5L6.5 2" stroke={DARK.bg} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : null}
                    </span>
                    <span className="truncate">{t.label}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}
