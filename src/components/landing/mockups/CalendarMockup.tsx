'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { MockupFrame } from './MockupFrame';
import { DARK } from './tokens';

/**
 * CalendarMockup — mirrors Lumina's real WeekView design:
 * 5 day columns (Mon-Fri), time sidebar with "8 AM / 9 AM …" labels,
 * event blocks with category colors from src/constants.tsx
 * (EVENT_COLORS), today-column highlight in primary/5%, and a red
 * current-time indicator line with a dot on the left edge.
 *
 * Colors are hard-coded (intentional) — the mockup must render
 * identically regardless of the visitor's theme.
 */

// Event colors pulled from src/constants.tsx — kept in sync by hand
// to avoid coupling landing mockups to app runtime imports.
const EVENT = {
  Critical: '#EF4444',
  Focus: '#6D59E0',
  Work: '#475569',
  Social: '#F59E0B',
  Personal: '#10B981',
  Health: '#EC4899',
} as const;

/** Slightly darker shade (for left accent border) */
const EVENT_DARK = {
  Critical: '#B91C1C',
  Focus: '#4C3DB3',
  Work: '#334155',
  Social: '#B45309',
  Personal: '#047857',
  Health: '#A21456',
} as const;

type EventKind = keyof typeof EVENT;

const DAYS = [
  { name: 'MON', date: 14, today: false },
  { name: 'TUE', date: 15, today: true },
  { name: 'WED', date: 16, today: false },
  { name: 'THU', date: 17, today: false },
  { name: 'FRI', date: 18, today: false },
] as const;

const START_HOUR = 8;
const END_HOUR = 18; // inclusive label-wise → 10 rows (8am..5pm labels), 10 hours
const HOURS = END_HOUR - START_HOUR; // 10

// Events — { day index 0-4, startMin from START_HOUR, duration, kind, label }
const EVENTS: {
  day: number;
  startMin: number;
  duration: number;
  kind: EventKind;
  label: string;
}[] = [
  { day: 0, startMin: 60, duration: 60, kind: 'Focus', label: 'Design review' },
  { day: 0, startMin: 240, duration: 90, kind: 'Work', label: 'PR review' },
  { day: 1, startMin: 30, duration: 120, kind: 'Focus', label: 'Deep work' },
  { day: 1, startMin: 210, duration: 45, kind: 'Social', label: 'Lunch ☕' },
  { day: 2, startMin: 0, duration: 60, kind: 'Critical', label: 'Standup' },
  { day: 2, startMin: 180, duration: 90, kind: 'Personal', label: 'Gym' },
  { day: 3, startMin: 90, duration: 60, kind: 'Work', label: '1:1 Sam' },
  { day: 3, startMin: 300, duration: 75, kind: 'Health', label: 'Therapy' },
  { day: 4, startMin: 60, duration: 120, kind: 'Focus', label: 'Write spec' },
  { day: 4, startMin: 270, duration: 45, kind: 'Social', label: 'Retro' },
];

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

export function CalendarMockup({ active }: { active: boolean }) {
  const reduce = useReducedMotion();

  // Current time → position the red indicator line
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    const compute = () => {
      const d = new Date();
      const h = d.getHours();
      const m = d.getMinutes();
      if (h < START_HOUR || h >= END_HOUR) {
        // Clamp to mid-morning for demo purposes so the line is visible
        setNowMin(150);
        return;
      }
      setNowMin((h - START_HOUR) * 60 + m);
    };
    compute();
    const id = window.setInterval(compute, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const todayColIdx = DAYS.findIndex((d) => d.today);

  return (
    <MockupFrame title="LUMINA · week view">
      <div
        className="w-full h-full flex flex-col"
        style={{ background: DARK.bg }}
      >
        {/* Header row */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: '42px repeat(5, 1fr)',
            borderBottom: `1px solid ${DARK.border}`,
            background: 'hsl(240 8% 11%)',
          }}
        >
          <div /> {/* sidebar spacer */}
          {DAYS.map((d) => (
            <div
              key={d.name}
              className="flex flex-col items-center justify-center py-2 gap-1"
            >
              <span
                className="font-mono text-[9px] uppercase tracking-[0.15em]"
                style={{ color: DARK.textMuted }}
              >
                {d.name}
              </span>
              {d.today ? (
                <span
                  className="flex items-center justify-center w-[22px] h-[22px] rounded-full font-display text-[12px] font-medium"
                  style={{
                    background: 'hsl(249 66% 61%)',
                    color: '#fff',
                  }}
                >
                  {d.date}
                </span>
              ) : (
                <span
                  className="font-display text-[14px] font-medium"
                  style={{ color: DARK.text, opacity: 0.8 }}
                >
                  {d.date}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Grid body */}
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <div
            className="absolute inset-0 grid"
            style={{ gridTemplateColumns: '42px repeat(5, 1fr)' }}
          >
            {/* Time sidebar */}
            <div
              className="relative"
              style={{
                borderRight: `1px solid ${DARK.border}`,
                background: 'hsl(240 8% 10%)',
              }}
            >
              {Array.from({ length: HOURS }).map((_, i) => {
                const top = (i / HOURS) * 100;
                return (
                  <div
                    key={i}
                    className="absolute right-1.5 font-mono text-[9px]"
                    style={{
                      top: `calc(${top}% + 2px)`,
                      color: DARK.textMuted,
                    }}
                  >
                    {formatHour(START_HOUR + i)}
                  </div>
                );
              })}
            </div>

            {/* Day columns */}
            {DAYS.map((d, colIdx) => (
              <div
                key={d.name}
                className="relative"
                style={{
                  borderRight:
                    colIdx < DAYS.length - 1
                      ? `1px solid ${DARK.borderSubtle}`
                      : 'none',
                  background: d.today
                    ? 'hsl(249 66% 61% / 0.05)'
                    : 'transparent',
                }}
              >
                {/* Hour grid lines */}
                {Array.from({ length: HOURS }).map((_, i) => {
                  const top = (i / HOURS) * 100;
                  return (
                    <div key={`h-${i}`}>
                      <div
                        className="absolute inset-x-0"
                        style={{
                          top: `${top}%`,
                          height: 1,
                          background: DARK.border,
                          opacity: 0.7,
                        }}
                      />
                      {/* half-hour dashed */}
                      <div
                        className="absolute inset-x-0"
                        style={{
                          top: `calc(${top}% + ${(1 / HOURS) * 50}%)`,
                          height: 0,
                          borderTop: `1px dashed ${DARK.borderSubtle}`,
                          opacity: 0.3,
                        }}
                      />
                    </div>
                  );
                })}

                {/* Events for this column */}
                {EVENTS.filter((e) => e.day === colIdx).map((e, i) => {
                  const totalMins = HOURS * 60;
                  const top = (e.startMin / totalMins) * 100;
                  const height = (e.duration / totalMins) * 100;
                  return (
                    <motion.div
                      key={i}
                      className="absolute left-[3px] right-[3px] overflow-hidden"
                      style={{
                        top: `${top}%`,
                        height: `${height}%`,
                        background: EVENT[e.kind],
                        borderLeft: `3px solid ${EVENT_DARK[e.kind]}`,
                        borderRadius: 6,
                        padding: '3px 5px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                      }}
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={
                        active
                          ? { opacity: 1, scale: 1 }
                          : { opacity: 0, scale: 0.94 }
                      }
                      transition={{
                        duration: reduce ? 0 : 0.38,
                        delay: reduce ? 0 : 0.12 + i * 0.05,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    >
                      <div
                        className="font-sans text-[9px] font-medium leading-tight truncate"
                        style={{ color: '#fff' }}
                      >
                        {e.label}
                      </div>
                      {e.duration >= 60 ? (
                        <div
                          className="font-mono text-[7px] leading-tight truncate"
                          style={{ color: 'rgba(255,255,255,0.7)' }}
                        >
                          {formatHour(
                            START_HOUR + Math.floor(e.startMin / 60),
                          )}
                        </div>
                      ) : null}
                    </motion.div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Current time indicator — spans today column only */}
          {nowMin !== null && todayColIdx >= 0 ? (
            <motion.div
              className="absolute pointer-events-none"
              style={{
                left: `calc(42px + ${todayColIdx} * ((100% - 42px) / 5))`,
                width: `calc((100% - 42px) / 5)`,
                top: `${(nowMin / (HOURS * 60)) * 100}%`,
                height: 1,
                display: 'flex',
                alignItems: 'center',
              }}
              initial={{ opacity: 0, x: -4 }}
              animate={active ? { opacity: 1, x: 0 } : { opacity: 0, x: -4 }}
              transition={{
                duration: reduce ? 0 : 0.4,
                delay: reduce ? 0 : 0.6,
              }}
            >
              <div
                className="rounded-full flex-shrink-0 -ml-[4px]"
                style={{
                  width: 8,
                  height: 8,
                  background: '#ef4444',
                  boxShadow: '0 0 6px rgba(239,68,68,0.6)',
                }}
              />
              <div
                className="flex-1 h-[1px]"
                style={{ background: '#ef4444' }}
              />
            </motion.div>
          ) : null}
        </div>
      </div>
    </MockupFrame>
  );
}
