'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * One slide inside the snap-scroll feature showcase.
 *
 * Layout: two-column on desktop (text left, mockup right),
 * stacked on mobile (text top, mockup bottom).
 */
export function FeatureSlide({
  eyebrow,
  title,
  description,
  bullets,
  mockup,
  active,
  accent,
}: {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  mockup: ReactNode;
  active: boolean;
  accent: string;
}) {
  const reduce = useReducedMotion();

  return (
    <div className="w-full h-full flex items-center justify-center px-4 md:px-10">
      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
        {/* Left — text */}
        <div className="flex flex-col gap-4 md:gap-5 order-2 md:order-1">
          <motion.div
            className="flex items-center gap-2"
            initial={{ opacity: 0, y: 8 }}
            animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: reduce ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: accent }}
            />
            <p
              className="font-mono text-[10px] uppercase tracking-[0.2em]"
              style={{ color: accent }}
            >
              {eyebrow}
            </p>
          </motion.div>

          <motion.h3
            className="font-display text-3xl md:text-5xl font-medium text-foreground tracking-[-0.035em] leading-[1.05]"
            initial={{ opacity: 0, y: 12 }}
            animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            transition={{
              duration: reduce ? 0 : 0.55,
              delay: reduce ? 0 : 0.1,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {title}
          </motion.h3>

          <motion.p
            className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-lg"
            initial={{ opacity: 0, y: 12 }}
            animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            transition={{
              duration: reduce ? 0 : 0.55,
              delay: reduce ? 0 : 0.18,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {description}
          </motion.p>

          <motion.ul
            className="flex flex-col gap-2 mt-1"
            initial={{ opacity: 0, y: 12 }}
            animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            transition={{
              duration: reduce ? 0 : 0.55,
              delay: reduce ? 0 : 0.26,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {bullets.map((b) => (
              <li
                key={b}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  className="mt-0.5 flex-shrink-0"
                  style={{ color: accent }}
                >
                  <path
                    d="M2.5 7L6 10.5L11.5 3.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>{b}</span>
              </li>
            ))}
          </motion.ul>

          {/* Lumi-style helper bubble */}
          <motion.div
            className="flex items-center gap-2 mt-3"
            initial={{ opacity: 0, y: 8 }}
            animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={{
              duration: reduce ? 0 : 0.5,
              delay: reduce ? 0 : 0.4,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <div
              className="flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0"
              style={{
                background: accent,
                opacity: 0.9,
              }}
              aria-hidden="true"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="5.5" cy="6.5" r="0.9" fill="#0a0a0a" />
                <circle cx="10.5" cy="6.5" r="0.9" fill="#0a0a0a" />
                <path
                  d="M5.5 10.5C6 11.2 7 11.6 8 11.6C9 11.6 10 11.2 10.5 10.5"
                  stroke="#0a0a0a"
                  strokeWidth="1"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </div>
            <div
              className="text-xs text-muted-foreground italic px-3 py-1.5 rounded-full border border-border bg-card/60"
            >
              Psst — swipe or use arrow keys
            </div>
          </motion.div>
        </div>

        {/* Right — mockup */}
        <motion.div
          className="w-full order-1 md:order-2"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={active ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.96 }}
          transition={{
            duration: reduce ? 0 : 0.6,
            delay: reduce ? 0 : 0.05,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          {mockup}
        </motion.div>
      </div>
    </div>
  );
}
