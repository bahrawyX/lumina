'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CursorZone } from './CursorZone';
import { Reveal } from './animations/Reveal';
import { LottieAnimation } from './LottieAnimation';
import { LOTTIES } from '@/lib/landing/lottieConfig';
import { useLottieHover } from '@/hooks/useLottieControls';

export function CTASection() {
  const calHover = useLottieHover(1, 1.5);

  return (
    <section className="relative py-16 md:py-24 px-4 md:px-6" aria-label="Get started">
      <CursorZone label="Begin" color="#10b981" className="relative">
        <Reveal
          className="relative max-w-5xl mx-auto rounded-3xl border border-border bg-card shadow-card overflow-hidden"
          y={20}
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
                {/* F1.11: see HeroSection — one `<a>`, not `<a><button>`. */}
                <Button asChild size="lg" className="rounded-xl px-8 text-sm font-semibold">
                  <Link href="/onboarding">Get started free</Link>
                </Button>
              </div>
            </div>

            {/* Calendar Lottie */}
            <div
              className="flex items-center justify-center pb-8 md:pb-0 md:pr-10"
              onMouseEnter={calHover.onMouseEnter}
              onMouseLeave={calHover.onMouseLeave}
              aria-hidden="true"
            >
              <Reveal
                className="w-[220px] h-[220px] md:w-[280px] md:h-[280px]"
                y={0}
                scale={0.92}
                duration={0.8}
                delay={0.2}
              >
                <LottieAnimation
                  src={LOTTIES.ctaCalendar.src}
                  autoplay
                  loop
                  className="w-full h-full"
                  dotLottieRefCallback={calHover.setRef}
                />
              </Reveal>
            </div>
          </div>
        </Reveal>
      </CursorZone>
    </section>
  );
}
