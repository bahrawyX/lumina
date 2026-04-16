'use client';

import { useMemo } from 'react';
import { motion, useInView, useReducedMotion, type Variants } from 'framer-motion';
import { useRef } from 'react';

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

export function BlurText({ text, className = '', delay = 0, as: Tag = 'h1' }: BlurTextProps) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const prefersReduced = useReducedMotion();
  const words = useMemo(() => text.split(' '), [text]);

  if (prefersReduced) {
    return <Tag ref={ref as any} className={className}>{text}</Tag>;
  }

  return (
    <Tag ref={ref as any} className={className} aria-label={text}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          custom={i + delay}
          variants={wordVariants}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          className="inline-block mr-[0.25em] last:mr-0"
          aria-hidden="true"
        >
          {word}
        </motion.span>
      ))}
    </Tag>
  );
}
