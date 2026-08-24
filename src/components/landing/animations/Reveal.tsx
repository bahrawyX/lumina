'use client';

import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Vertical offset the element animates up from. `0` gives a pure fade. */
  y?: number;
  /** Scale the element animates up from. `1` disables the scale. */
  scale?: number;
  delay?: number;
  duration?: number;
  /** IntersectionObserver root margin — negative values delay the trigger. */
  margin?: string;
} & Omit<HTMLMotionProps<'div'>, 'children' | 'initial' | 'animate' | 'whileInView' | 'viewport' | 'transition'>;

/**
 * Scroll-reveal wrapper for the marketing page.
 *
 * Replaces the hand-rolled `useInView` + `animate={isInView ? {...} : {}}`
 * pattern that shipped across five sections. That pattern had two defects:
 *
 *  - An **empty object is not an animation target**. If the observer never
 *    fired — a mis-measured sticky ancestor, an observer-less environment, a
 *    framer-motion failure — the element stayed at `initial: { opacity: 0 }`
 *    permanently and the section was invisible with no recovery.
 *  - It ignored `prefers-reduced-motion`, unlike the sibling `BlurText`,
 *    `CountUp` and `SmoothScroll` components.
 *
 * `whileInView` + `viewport={{ once: true }}` is framer-motion's own
 * implementation of the same idea and always resolves to a real target,
 * including for elements already inside the viewport at mount.
 *
 * `data-reveal` is the no-JS escape hatch: `globals.css` forces every tagged
 * element fully visible under `@media (scripting: none)`, and `layout.tsx`
 * carries a `<noscript>` copy of the same rule. Marketing copy must be legible
 * even when nothing runs.
 */
export function Reveal({
  children,
  className,
  y = 16,
  scale = 1,
  delay = 0,
  duration = 0.6,
  margin = '-60px',
  ...rest
}: RevealProps) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return (
      <div data-reveal className={className} {...(rest as Record<string, unknown>)}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      data-reveal
      className={className}
      initial={{ opacity: 0, y, scale }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
