/**
 * F1.10: this was `'use client'` with nothing to justify it. Every interactive
 * child (`Reveal`, `CursorZone`, `CountUp`) carries its own `'use client'`, so
 * a server component can render them and the boundary simply moves down —
 * which takes framer-motion out of this module's client bundle. The `/` route
 * shipped 318 KB gzip with nine of eleven landing components importing it.
 */
import { CountUp } from './animations/CountUp';
import { Reveal } from './animations/Reveal';

const STATS = [
  { value: 6, label: 'Workspace views' },
  { value: 4, label: 'Focus modes' },
  { value: 3, label: 'Subtask levels', suffix: '' },
  { value: 1, label: 'AI daily brief', suffix: '' },
];

export function StatsBar() {
  return (
    <section className="py-14 md:py-20 px-4 md:px-6" aria-label="Stats">
      <Reveal className="max-w-4xl mx-auto" y={0} margin="-40px">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4 text-center">
          {STATS.map((stat) => (
            <div key={stat.label}>
              <CountUp
                to={stat.value}
                duration={1500}
                className="font-display text-3xl md:text-4xl font-medium text-foreground tracking-[-0.035em]"
                suffix={stat.suffix}
              />
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground-subtle mt-2">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
