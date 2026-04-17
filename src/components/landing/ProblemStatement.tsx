'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

export function ProblemStatement() {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section ref={ref} className="py-16 md:py-24 px-4 md:px-6" aria-label="The problem">
      <motion.div
        className="max-w-3xl mx-auto text-center md:text-left"
        initial={{ opacity: 0, y: 16 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">
          The problem
        </p>
        <p className="font-display text-xl md:text-2xl font-medium text-foreground tracking-[-0.02em] leading-relaxed">
          Your calendar is in one app. Tasks in another. Focus timer in a third. Notes in a fourth.{' '}
          <span className="text-muted-foreground">None of them talk to each other.</span>
        </p>
      </motion.div>
    </section>
  );
}
