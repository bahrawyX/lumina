'use client';

import { Reveal } from './animations/Reveal';

export function ProblemStatement() {
  return (
    <section className="py-16 md:py-24 px-4 md:px-6" aria-label="The problem">
      <Reveal
        className="max-w-3xl mx-auto text-center md:text-left"
        y={16}
        duration={0.7}
        margin="-80px"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">
          The problem
        </p>
        <p className="font-display text-xl md:text-2xl font-medium text-foreground tracking-[-0.02em] leading-relaxed">
          Your calendar is in one app. Tasks in another. Focus timer in a third. Notes in a fourth.{' '}
          <span className="text-muted-foreground">None of them talk to each other.</span>
        </p>
      </Reveal>
    </section>
  );
}
