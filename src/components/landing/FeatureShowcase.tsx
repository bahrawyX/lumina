'use client';

import { useEffect, useRef, useState, useLayoutEffect, useCallback } from 'react';
import {
  motion,
  AnimatePresence,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { CursorZone } from './CursorZone';
import { FeatureSlide } from './FeatureSlide';
import { CalendarMockup } from './mockups/CalendarMockup';
import { TaskBoardMockup } from './mockups/TaskBoardMockup';
import { PlannerMockup } from './mockups/PlannerMockup';
import { FocusMockup } from './mockups/FocusMockup';
import { GoalsMockup } from './mockups/GoalsMockup';
import { DocsMockup } from './mockups/DocsMockup';
import { ACCENT } from './mockups/tokens';

/* ── Slide data — unchanged ───────────────────────────────────────────────── */

type SlideDef = {
  key: string;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  accent: string;
  mockup: (active: boolean) => React.ReactNode;
};

const SLIDES: SlideDef[] = [
  {
    key: 'calendar',
    eyebrow: '01 · Calendar',
    title: 'Your week, already shaped.',
    description:
      'Month, week, and day views. Drag to reschedule. Connect Google Calendar or Outlook and everything syncs in one place.',
    bullets: [
      'Drag-and-drop events across any view',
      'Two-way Google and Outlook sync',
      'Color-coded by category',
    ],
    accent: ACCENT.violet,
    mockup: (active) => <CalendarMockup active={active} />,
  },
  {
    key: 'tasks',
    eyebrow: '02 · Tasks',
    title: 'Kanban that keeps up.',
    description:
      'Kanban or list view, your call. Subtasks, priorities, due dates, filters. Tasks link directly to calendar events and documents.',
    bullets: [
      'Drag-and-drop kanban with subtasks',
      // F1.3: this said 'saved views'. `grep -rn "saved views" -i src/`
      // returned exactly one hit — that line. The feature does not exist.
      'Filters, search, and priority sorting',
      'Priorities and due-date sorting',
    ],
    accent: ACCENT.sky,
    mockup: (active) => <TaskBoardMockup active={active} />,
  },
  {
    key: 'planner',
    eyebrow: '03 · Daily planner',
    title: 'Today, on one screen.',
    description:
      "Drag tasks from your pool onto today's timeline. Lumina spots your free windows and tells you where deep work fits.",
    bullets: [
      'Time-blocked view of today',
      'Free-window detection',
      'Daily mood and energy check-ins',
    ],
    accent: ACCENT.emerald,
    mockup: (active) => <PlannerMockup active={active} />,
  },
  {
    key: 'focus',
    eyebrow: '04 · Focus',
    title: 'Deep work, measured.',
    description:
      'Focus timer, Pomodoro cycles with mood tracking, stopwatch, ambient sounds. Every session builds your streak and earns coins.',
    bullets: [
      'Pomodoro, stopwatch, and custom timers',
      // F1.3: 'focus playlists' likewise existed only in this string.
      'Ambient sound mixer with four tracks',
      'Streaks, coins, and daily targets',
    ],
    accent: ACCENT.rose,
    mockup: (active) => <FocusMockup active={active} />,
  },
  {
    key: 'goals',
    eyebrow: '05 · Goals',
    title: 'Targets that self-update.',
    description:
      'Set weekly, monthly, or quarterly goals with targets. Link tasks to goals and watch progress update automatically as you work.',
    bullets: [
      'Weekly, monthly, and quarterly goals',
      'Linked tasks update progress',
      'History and roll-ups for every cycle',
    ],
    accent: ACCENT.amber,
    mockup: (active) => <GoalsMockup active={active} />,
  },
  {
    key: 'docs',
    eyebrow: '06 · Documents',
    title: 'Notes that know your work.',
    description:
      'Block editor with multi-column layouts, inline task blocks, and AI writing assist. Docs connect to your tasks, events, and sessions.',
    bullets: [
      'Block editor with multi-column layouts',
      'Inline task and event blocks',
      'AI writing and summarization',
    ],
    accent: ACCENT.lime,
    mockup: (active) => <DocsMockup active={active} />,
  },
];

/* ── Component ────────────────────────────────────────────────────────────── */

/**
 * Horizontal feature showcase driven by vertical scroll.
 *
 * Pattern adapted from Benjamin De Cock's sandbox
 * (framer-motion-horizontal-scroll-by-scrolling-vertically-5crke):
 *
 * 1. A "ghost" spacer inside the section creates vertical scroll distance
 *    equal to the horizontal track's total scrollWidth minus one viewport.
 * 2. A sticky inner wrapper pins the viewport at top while the user scrolls
 *    through that distance.
 * 3. `useScroll({ target: sectionRef, offset: ['start start', 'end end'] })`
 *    gives us a 0→1 progress value scoped to this section only (not the
 *    whole page), which we transform into an `x` translation.
 * 4. `useSpring` smooths the translation with physics.
 *
 * No wheel hijacking, no IntersectionObserver, no Lenis pause — the page's
 * native (smooth) scroll flows through this section and out the other side.
 */
export function FeatureShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);

  const [scrollRange, setScrollRange] = useState(0);
  const [viewportW, setViewportW] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  /* Measure the horizontal track's scrollWidth */
  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    setScrollRange(scrollRef.current.scrollWidth);
  }, []);

  /* Track viewport width via ResizeObserver on the ghost element */
  const onResize = useCallback((entries: ResizeObserverEntry[]) => {
    for (const entry of entries) {
      setViewportW(entry.contentRect.width);
    }
  }, []);

  useLayoutEffect(() => {
    if (!ghostRef.current) return;
    const observer = new ResizeObserver((entries) => onResize(entries));
    observer.observe(ghostRef.current);
    return () => observer.disconnect();
  }, [onResize]);

  /* Re-measure scrollRange whenever the viewport width changes
     (slide widths are viewport-relative) */
  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    setScrollRange(scrollRef.current.scrollWidth);
  }, [viewportW]);

  /* Scroll progress scoped to the section — 0 when section top hits
     viewport top, 1 when section bottom hits viewport bottom */
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const transform = useTransform(
    scrollYProgress,
    [0, 1],
    [0, -(scrollRange - viewportW)],
  );

  const spring = useSpring(transform, {
    damping: 15,
    mass: 0.27,
    stiffness: 55,
  });

  /* Derive activeIndex from scroll progress so the dots + counter stay in
     sync with the currently-visible slide */
  useEffect(() => {
    const unsub = scrollYProgress.on('change', (v) => {
      const idx = Math.max(
        0,
        Math.min(SLIDES.length - 1, Math.round(v * (SLIDES.length - 1))),
      );
      setActiveIndex(idx);
    });
    return unsub;
  }, [scrollYProgress]);

  const activeSlide = SLIDES[activeIndex] ?? SLIDES[0]!;
  const progress = (activeIndex + 1) / SLIDES.length;

  /* Jump to a specific slide by scrolling the window to the equivalent
     position inside the section */
  const goToSlide = useCallback((index: number) => {
    const section = sectionRef.current;
    if (!section) return;
    const clamped = Math.max(0, Math.min(index, SLIDES.length - 1));
    const travel = section.offsetHeight - window.innerHeight;
    if (travel <= 0) return;
    const fraction = clamped / (SLIDES.length - 1);
    const top = section.offsetTop + travel * fraction;
    window.scrollTo({ top, behavior: 'smooth' });
  }, []);

  /* Arrow-key navigation — only while focus is inside the carousel.
   *
   * F1.5: this was a `window` listener gated on "is the section anywhere on
   * screen", and the section is `h-screen` sticky with a ghost spacer roughly
   * six viewport heights tall — so that condition held for most of the page.
   * It also claimed ArrowUp and ArrowDown, which meant a keyboard user pressing
   * ArrowDown to SCROLL got a slide change instead.
   *
   * Vertical arrows belong to the browser. Horizontal arrows belong to the
   * carousel, and only when the user is actually in it — which is also what the
   * ARIA tablist pattern specifies.
   */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const section = sectionRef.current;
      if (!section) return;
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;

      const active = document.activeElement;
      if (!active || !section.contains(active)) return;

      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if ((e.target as HTMLElement | null)?.isContentEditable) return;

      if (e.key === 'ArrowRight' && activeIndex < SLIDES.length - 1) {
        e.preventDefault();
        goToSlide(activeIndex + 1);
      } else if (e.key === 'ArrowLeft' && activeIndex > 0) {
        e.preventDefault();
        goToSlide(activeIndex - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeIndex, goToSlide]);

  return (
    <section
      ref={sectionRef}
      id="features"
      aria-label="Feature showcase"
      className="relative"
    >
      {/* Sticky viewport — pinned at top while the user scrolls through
          the ghost's height below */}
      {/*
        F1.8: this was `h-screen ... overflow-hidden` with a non-scrollable
        inner track. On a 375x667 device each slide stacks a section header, a
        16:10 mockup, an eyebrow, a text-3xl title, a description, three
        bullets, a bubble, and the dots/progress block — well past the ~520px
        of usable height. Because the wrapper was `overflow-hidden` with
        `items-center`, the excess was CLIPPED WITH NO WAY TO REACH IT.

        `100svh` rather than `100vh`: `h-screen` is the LARGE viewport on iOS
        Safari, so content sat under the retracting URL bar even before the
        clipping. `overflow-x-hidden` keeps the horizontal track hidden (that
        is what the carousel translates) while letting the slide scroll
        vertically.
      */}
      <div className="sticky top-0 h-[100svh] w-full overflow-x-hidden flex flex-col">
        {/* Section heading */}
        <div className="text-center pt-12 md:pt-10 pb-5 md:pb-4 px-4 flex-shrink-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground-subtle mb-3">
            Everything you need
          </p>
          <h2 className="font-display text-2xl md:text-3xl font-medium text-foreground tracking-[-0.035em]">
            Six views. One workspace.
          </h2>
        </div>

        <CursorZone
          label="Swipe"
          color={activeSlide.accent}
          className="flex-1 min-h-0"
        >
          <div className="relative h-full w-full overflow-hidden">
            <motion.div
              ref={scrollRef}
              className="flex h-full"
              style={{ x: spring }}
              role="region"
              aria-roledescription="carousel"
              aria-label="Lumina features"
            >
              {SLIDES.map((slide, i) => (
                <div
                  key={slide.key}
                  id={`feature-slide-${slide.key}`}
                  data-slide-index={i}
                  className="flex-shrink-0 w-screen h-full"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${SLIDES.length}: ${slide.title}`}
                  // F1.9: all six slides sat in the accessibility tree at once,
                  // so a screen reader read every feature list back-to-back
                  // with no indication that five of them were off-screen — and
                  // Tab walked into links the user could not see. `inert` also
                  // removes them from the tab order, which `aria-hidden` alone
                  // does not.
                  aria-hidden={i !== activeIndex}
                  inert={i !== activeIndex}
                >
                  <FeatureSlide
                    eyebrow={slide.eyebrow}
                    title={slide.title}
                    description={slide.description}
                    bullets={slide.bullets}
                    mockup={slide.mockup(i === activeIndex)}
                    active={i === activeIndex}
                    accent={slide.accent}
                  />
                </div>
              ))}
            </motion.div>
          </div>
        </CursorZone>

        {/* Navigation: dots + progress + counter */}
        <div className="flex flex-col items-center gap-3 pt-3 pb-10 md:pb-6 flex-shrink-0">
          <div
            className="flex items-center gap-2"
            role="tablist"
            aria-label="Slide navigation"
          >
            {SLIDES.map((slide, i) => (
              <button
                key={slide.key}
                type="button"
                role="tab"
                aria-selected={i === activeIndex}
                aria-label={`Go to slide ${i + 1}: ${slide.title}`}
                // F1.9: `role="tab"` without `aria-controls` and without a
                // roving tabindex is a half-implemented pattern — a screen
                // reader announces "tab" and then cannot say what it controls.
                aria-controls={`feature-slide-${slide.key}`}
                tabIndex={i === activeIndex ? 0 : -1}
                onClick={() => goToSlide(i)}
                className="relative h-2 rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                style={{
                  width: i === activeIndex ? 28 : 8,
                  background:
                    i === activeIndex ? slide.accent : 'hsl(var(--border))',
                }}
              />
            ))}
          </div>

          <div className="w-40 md:w-56 h-0.5 rounded-full overflow-hidden bg-border">
            <motion.div
              className="h-full rounded-full"
              style={{ background: activeSlide.accent, transformOrigin: 'left' }}
              animate={{ scaleX: progress }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>

          <div className="flex items-baseline gap-1 font-mono text-xs">
            <AnimatePresence mode="wait">
              <motion.span
                key={activeIndex}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="tabular-nums"
                style={{ color: activeSlide.accent }}
              >
                {String(activeIndex + 1).padStart(2, '0')}
              </motion.span>
            </AnimatePresence>
            <span className="text-muted-foreground-subtle">/</span>
            <span className="text-muted-foreground-subtle tabular-nums">
              {String(SLIDES.length).padStart(2, '0')}
            </span>
          </div>
        </div>
      </div>

      {/* Ghost — gives the section enough vertical height that scrolling
          through it equals traversing the full horizontal track width */}
      <div
        ref={ghostRef}
        aria-hidden="true"
        style={{ height: scrollRange }}
        className="w-full pointer-events-none"
      />
    </section>
  );
}
