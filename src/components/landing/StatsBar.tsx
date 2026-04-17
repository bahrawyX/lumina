'use client';

import { CountUp } from './animations/CountUp';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const STATS = [
  { value: 6, label: 'Workspace views' },
  { value: 4, label: 'Focus modes' },
  { value: 3, label: 'Subtask levels', suffix: '' },
  { value: 1, label: 'AI daily brief', suffix: '' },
];

export function StatsBar() {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <section ref={ref} className="py-14 md:py-20 px-4 md:px-6" aria-label="Stats">
      <motion.div
        className="max-w-4xl mx-auto"
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4 text-center">
          {STATS.map((stat) => (
            <div key={stat.label}>
              <CountUp
                to={stat.value}
                duration={1500}
                className="font-display text-3xl md:text-4xl font-medium text-foreground tracking-[-0.035em]"
                suffix={stat.suffix}
              />
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 mt-2">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
