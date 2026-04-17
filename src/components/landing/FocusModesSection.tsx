'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { CursorZone } from './CursorZone';

export function FocusModesSection() {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section ref={ref} className="py-16 md:py-24 px-4 md:px-6" aria-label="Focus modes">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10 md:mb-14">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-3">
            Deep work
          </p>
          <h2 className="font-display text-2xl md:text-3xl font-medium text-foreground tracking-[-0.035em]">
            Four ways to focus.
          </h2>
          <p className="text-sm text-muted-foreground mt-3 italic max-w-md mx-auto">
            Each session earns coins, builds streaks, and tracks mood — so you can see what actually works.
          </p>
        </div>

        <CursorZone label="Focus" color="#f59e0b" as="div" className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 max-w-3xl mx-auto">
          <motion.div
            className="card-lift rounded-xl border border-border bg-card p-4 md:p-5 shadow-card text-center"
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.45, delay: 0, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-3xl mb-3 block" aria-hidden="true">🍅</span>
            <h3 className="font-display text-sm font-medium text-foreground tracking-[-0.02em] mb-1">
              Pomodoro
            </h3>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Work/break cycles with auto-chime and session tracking.
            </p>
          </motion.div>

          <motion.div
            className="card-lift rounded-xl border border-border bg-card p-4 md:p-5 shadow-card text-center"
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.45, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-3xl mb-3 block" aria-hidden="true">⏱️</span>
            <h3 className="font-display text-sm font-medium text-foreground tracking-[-0.02em] mb-1">
              Focus Timer
            </h3>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Dedicated countdown linked to a specific task.
            </p>
          </motion.div>

          <motion.div
            className="card-lift rounded-xl border border-border bg-card p-4 md:p-5 shadow-card text-center"
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.45, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-3xl mb-3 block" aria-hidden="true">⏳</span>
            <h3 className="font-display text-sm font-medium text-foreground tracking-[-0.02em] mb-1">
              Stopwatch
            </h3>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Open-ended timing with lap support.
            </p>
          </motion.div>

          <motion.div
            className="card-lift rounded-xl border border-border bg-card p-4 md:p-5 shadow-card text-center"
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.45, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-3xl mb-3 block" aria-hidden="true">🎧</span>
            <h3 className="font-display text-sm font-medium text-foreground tracking-[-0.02em] mb-1">
              Ambient Sounds
            </h3>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Brown noise, rain, forest, and ocean — built in.
            </p>
          </motion.div>
        </CursorZone>
      </div>
    </section>
  );
}
