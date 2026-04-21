'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BlurText } from './animations/BlurText';
import { LottieAnimation } from './LottieAnimation';
import { LOTTIES } from '@/lib/landing/lottieConfig';
import { useLottieHover } from '@/hooks/useLottieControls';
import { CursorZone } from './CursorZone';
import { motion } from 'framer-motion';

export function HeroSection() {
  const heroHover = useLottieHover(1, 1.5);

  return (
    <section className="relative overflow-hidden" aria-label="Hero">
      {/* Subtle gradient orbs — decorative */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div
          className="absolute top-[-20%] left-[10%] w-[500px] h-[500px] rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle, hsl(var(--primary)), transparent 70%)' }}
        />
        <div
          className="absolute bottom-[-10%] right-[5%] w-[400px] h-[400px] rounded-full opacity-[0.05]"
          style={{ background: 'radial-gradient(circle, hsl(var(--primary)), transparent 70%)' }}
        />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 md:px-6 pt-20 pb-24 md:pt-32 md:pb-36">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-10 lg:gap-16 items-center">
          <div className="max-w-3xl">
            {/* Eyebrow */}
            <motion.p
              className="font-mono text-[10px] md:text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60 mb-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              Productivity workspace
            </motion.p>

            {/* Headline */}
            <BlurText
              text="Your week, in one place."
              as="h1"
              className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-medium text-foreground tracking-[-0.035em] leading-[1.05]"
            />

            {/* Subline */}
            <motion.p
              className="mt-5 md:mt-6 text-base md:text-lg text-muted-foreground max-w-xl leading-relaxed italic"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              Calendar, tasks, focus sessions, and goals — connected by an AI that knows when you do your best work.
            </motion.p>

            {/* CTAs */}
            <motion.div
              className="mt-8 md:mt-10 flex flex-wrap items-center gap-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link href="/onboarding" tabIndex={-1}>
                <Button size="lg" className="rounded-xl px-6 text-sm font-semibold">
                  Get started free
                </Button>
              </Link>
              <Link href="#features" tabIndex={-1}>
                <Button variant="outline" size="lg" className="rounded-xl px-6 text-sm">
                  See how it works
                </Button>
              </Link>
            </motion.div>
          </div>

          {/* Hero Lottie — floating calendar/planner. Hover speeds it up. */}
          <CursorZone label="Explore" color="#cef136" className="hidden lg:block flex-shrink-0">
            <motion.div
              className="w-[350px] h-[350px]"
              onMouseEnter={heroHover.onMouseEnter}
              onMouseLeave={heroHover.onMouseLeave}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              aria-hidden="true"
            >
              <LottieAnimation
                src={LOTTIES.hero.src}
                autoplay
                loop
                className="w-full h-full"
                dotLottieRefCallback={heroHover.setRef}
              />
            </motion.div>
          </CursorZone>

          {/* Mobile/tablet Lottie — shows below headline on narrow screens */}
          <motion.div
            className="lg:hidden w-[200px] h-[200px] mx-auto mt-4"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            aria-hidden="true"
          >
            <LottieAnimation
              src={LOTTIES.hero.src}
              autoplay
              loop
              className="w-full h-full"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}