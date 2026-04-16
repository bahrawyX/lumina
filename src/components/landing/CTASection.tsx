'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { LottieAnimation } from './LottieAnimation';
import { LOTTIES } from '@/lib/landing/lottieConfig';
import { useLottieInView, useLottieHoverReplay } from '@/hooks/useLottieControls';
import { CursorZone } from './CursorZone';
import { useRef } from 'react';

export function CTASection() {
  // First play: triggers when section enters view
  const onView = useLottieInView({ once: true, margin: '-60px' });
  // Replay on CTA click — uses a SEPARATE Lottie instance layered on top
  const replay = useLottieHoverReplay();
  const sectionRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={sectionRef}
      className="relative py-16 md:py-24 px-4 md:px-6 overflow-hidden"
      aria-label="Get started"
    >
      {/* Confetti Lottie layer 1 — plays once on view, spans full section */}
      <div
        ref={onView.containerRef}
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        <div className="w-full max-w-[600px] h-[400px] md:h-[500px]">
          <LottieAnimation
            src={LOTTIES.confetti.src}
            autoplay={false}
            loop={false}
            className="w-full h-full"
            dotLottieRefCallback={onView.setDotLottieRef}
          />
        </div>
      </div>

      {/* Confetti Lottie layer 2 — replays on CTA click */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        <div className="w-full max-w-[600px] h-[400px] md:h-[500px]">
          <LottieAnimation
            src={LOTTIES.confetti.src}
            autoplay={false}
            loop={false}
            className="w-full h-full"
            dotLottieRefCallback={replay.setRef}
          />
        </div>
      </div>

      <CursorZone label="Begin" color="#10b981" className="relative">
        <motion.div
          className="relative max-w-2xl mx-auto text-center rounded-3xl border border-border bg-card p-10 md:p-14 shadow-card"
          initial={{ opacity: 0, y: 20 }}
          animate={onView.isInView ? { opacity: 1, y: 0 } : {}}
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
              <Button
                size="lg"
                className="rounded-xl px-8 text-sm font-semibold"
                onClick={replay.replay}
              >
                Get started free
              </Button>
            </Link>
          </div>
        </motion.div>
      </CursorZone>
    </section>
  );
}
