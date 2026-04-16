'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const MODES = [
  { name: 'Pomodoro', desc: 'Work/break cycles with auto-chime and session tracking.', emoji: '🍅' },
  { name: 'Focus Timer', desc: 'Dedicated countdown linked to a specific task.', emoji: '⏱️' },
  { name: 'Stopwatch', desc: 'Open-ended timing with lap support.', emoji: '⏳' },
  { name: 'Ambient Sounds', desc: 'Brown noise, rain, forest, and ocean — built in.', emoji: '🎧' },
];

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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 max-w-3xl mx-auto">
          {MODES.map((mode, i) => (
            <motion.div
              key={mode.name}
              className="card-lift rounded-xl border border-border bg-card p-4 md:p-5 shadow-card text-center"
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="text-2xl mb-3 block" aria-hidden="true">{mode.emoji}</span>
              <h3 className="font-display text-sm font-medium text-foreground tracking-[-0.02em] mb-1">
                {mode.name}
              </h3>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {mode.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
