'use client';

import { useMemo, useRef } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';

interface BlurTextProps {
  text: string;
  className?: string;
  delay?: number;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
}

const wordVariants: Variants = {
  hidden: { opacity: 0, filter: 'blur(8px)', y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    filter: 'blur(0px)',
    y: 0,
    transition: {
      duration: 0.5,
      delay: i * 0.06,
      ease: [0.16, 1, 0.3, 1],
    },
  }),
};

/**
 * Per-word blur-in headline.
 *
 * `whileInView` replaces the previous `animate={isInView ? 'visible' : 'hidden'}`:
 * that form left every word pinned at `hidden` — `opacity: 0` — for the life of
 * the document if the IntersectionObserver callback never ran, which for the
 * page's `<h1>` meant the headline simply never appeared.
 *
 * `data-reveal` opts the element into the no-JS override in `globals.css`, so
 * the headline is legible even when the bundle never executes.
 */
export function BlurText({ text, className = '', delay = 0, as: Tag = 'h1' }: BlurTextProps) {
  const ref = useRef<HTMLElement>(null);
  const prefersReduced = useReducedMotion();
  const words = useMemo(() => text.split(' '), [text]);

  if (prefersReduced) {
    return (
      <Tag ref={ref as never} className={className}>
        {text}
      </Tag>
    );
  }

  return (
    <Tag ref={ref as never} className={className} aria-label={text} data-reveal>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          custom={i + delay}
          variants={wordVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="inline-block mr-[0.25em] last:mr-0"
          aria-hidden="true"
        >
          {word}
        </motion.span>
      ))}
    </Tag>
  );
}
