'use client';

import { motion } from 'framer-motion';
import { useRef } from 'react';
import type React from 'react';
import { CursorZone } from './CursorZone';
import { LottieAnimation } from './LottieAnimation';
import { LOTTIES } from '@/lib/landing/lottieConfig';
import { useLottieHover } from '@/hooks/useLottieControls';

const FOCUS_MODES = [
  {
    lottieKey: 'focusPomodoro' as const,
    label: 'Pomodoro',
    desc: 'Work/break cycles with auto-chime and session tracking.',
    iconStyle: undefined,
  },
  {
    lottieKey: 'focusTimer' as const,
    label: 'Focus Timer',
    desc: 'Dedicated countdown linked to a specific task.',
    iconStyle: undefined,
  },
  {
    lottieKey: 'focusStopwatch' as const,
    label: 'Stopwatch',
    desc: 'Open-ended timing with lap support.',
    iconStyle: undefined,
  },
  {
    lottieKey: 'focusSounds' as const,
    label: 'Ambient Sounds',
    desc: 'Brown noise, rain, forest, and ocean — built in.',
    // Shift blue headphones → warm amber to match the section accent
    iconStyle: { filter: 'hue-rotate(175deg) saturate(1.3)' } as React.CSSProperties,
  },
];

export function FocusModesSection() {
  const ref = useRef<HTMLElement>(null);

  const hover0 = useLottieHover(0.7, 2);
  const hover1 = useLottieHover(0.7, 2);
  const hover2 = useLottieHover(0.7, 2);
  const hover3 = useLottieHover(0.7, 2);
  const hovers = [hover0, hover1, hover2, hover3];

  return (
    <section ref={ref} className="py-16 md:py-24 px-4 md:px-6" aria-label="Focus modes">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10 md:mb-14">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground-subtle mb-3">
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
          {FOCUS_MODES.map((mode, i) => {
            const hover = hovers[i]!;
            return (
              // F1.2: `initial={{opacity:0}}` with
              // `animate={isInView ? {...} : {}}` leaves the card permanently
              // invisible if the observer never fires — an empty `animate`
              // object is not "stay where you are", it is "no target", so the
              // element sits at its `initial` forever. That happens with JS
              // disabled or broken, and in any browser without
              // IntersectionObserver. Four cards, invisible, on a marketing page.
              //
              // `whileInView` + `viewport={{ once: true }}` is
              // framer-motion's own primitive for this and does not depend on a
              // hook's boolean, and `data-reveal` is the no-JS escape hatch
              // `globals.css` keys its `(scripting: none)` override on — which
              // this component was missing entirely.
              <motion.div
                key={mode.lottieKey}
                data-reveal
                className="card-lift rounded-xl border border-border bg-card p-4 md:p-5 shadow-card text-center cursor-default"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.45, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                onHoverStart={hover.onMouseEnter}
                onHoverEnd={hover.onMouseLeave}
              >
                <div className="w-16 h-16 mx-auto mb-2" style={mode.iconStyle} aria-hidden="true">
                  <LottieAnimation
                    src={LOTTIES[mode.lottieKey].src}
                    loop
                    autoplay
                    className="w-full h-full"
                    dotLottieRefCallback={hover.setRef}
                  />
                </div>
                <h3 className="font-display text-sm font-medium text-foreground tracking-[-0.02em] mb-1">
                  {mode.label}
                </h3>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {mode.desc}
                </p>
              </motion.div>
            );
          })}
        </CursorZone>
      </div>
    </section>
  );
}
