'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { CursorZone } from './CursorZone';
import { LottieAnimation } from './LottieAnimation';
import { LOTTIES } from '@/lib/landing/lottieConfig';
import { useLottieHover } from '@/hooks/useLottieControls';

export function CTASection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  const calHover = useLottieHover(1, 1.5);

  return (
    <section className="relative py-16 md:py-24 px-4 md:px-6" aria-label="Get started">
      <CursorZone label="Begin" color="#10b981" className="relative">
        <motion.div
          ref={ref}
          className="relative max-w-5xl mx-auto rounded-3xl border border-border bg-card shadow-card overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex flex-col md:flex-row items-center gap-0">
            {/* Text + CTA */}
            <div className="flex-1 p-10 md:p-14 text-center md:text-left">
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
            </div>

            {/* Calendar Lottie */}
            <div
              className="flex items-center justify-center pb-8 md:pb-0 md:pr-10"
              onMouseEnter={calHover.onMouseEnter}
              onMouseLeave={calHover.onMouseLeave}
              aria-hidden="true"
            >
              <motion.div
                className="w-[220px] h-[220px] md:w-[280px] md:h-[280px]"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={isInView ? { opacity: 1, scale: 1 } : {}}
                transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <LottieAnimation
                  src={LOTTIES.ctaCalendar.src}
                  autoplay
                  loop
                  className="w-full h-full"
                  dotLottieRefCallback={calHover.setRef}
                />
              </motion.div>
            </div>
          </div>
        </motion.div>
      </CursorZone>
    </section>
  );
}
