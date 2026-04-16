'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

export function CTASection() {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section ref={ref} className="py-16 md:py-24 px-4 md:px-6" aria-label="Get started">
      <motion.div
        className="max-w-2xl mx-auto text-center rounded-3xl border border-border bg-card p-10 md:p-14 shadow-card"
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <h2 className="font-display text-2xl md:text-3xl font-medium text-foreground tracking-[-0.035em]">
          Start planning your week.
        </h2>
        <p className="text-sm text-muted-foreground mt-3 italic">
          Free to use. No credit card required.
        </p>
        <div className="mt-8">
          <Link href="/onboarding" tabIndex={-1}>
            <Button size="lg" className="rounded-xl px-8 text-sm font-semibold">
              Get started free
            </Button>
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
