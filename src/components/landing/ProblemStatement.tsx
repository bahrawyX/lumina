'use client';

import { motion } from 'framer-motion';
import { LottieAnimation } from './LottieAnimation';
import { LOTTIES } from '@/lib/landing/lottieConfig';
import { useLottieInView } from '@/hooks/useLottieControls';

export function ProblemStatement() {
  const inView = useLottieInView({ once: true, margin: '-80px' });

  return (
    <section ref={inView.containerRef} className="py-16 md:py-24 px-4 md:px-6" aria-label="The problem">
      <motion.div
        className="max-w-3xl mx-auto flex flex-col md:flex-row items-center gap-6 md:gap-10"
        initial={{ opacity: 0, y: 16 }}
        animate={inView.isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Lottie — tangled lines resolving. Plays once on view. */}
        <div className="w-[100px] md:w-[140px] h-[100px] md:h-[140px] flex-shrink-0" aria-hidden="true">
          <LottieAnimation
            src={LOTTIES.untangle.src}
            autoplay={false}
            loop={false}
            className="w-full h-full"
            dotLottieRefCallback={inView.setDotLottieRef}
          />
        </div>

        <div className="text-center md:text-left">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">
            The problem
          </p>
          <p className="font-display text-xl md:text-2xl font-medium text-foreground tracking-[-0.02em] leading-relaxed">
            Your calendar is in one app. Tasks in another. Focus timer in a third. Notes in a fourth.{' '}
            <span className="text-muted-foreground">None of them talk to each other.</span>
          </p>
        </div>
      </motion.div>
    </section>
  );
}
