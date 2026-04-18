'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { CursorZone } from './CursorZone';
import { FeatureSlide } from './FeatureSlide';
import { CalendarMockup } from './mockups/CalendarMockup';
import { TaskBoardMockup } from './mockups/TaskBoardMockup';
import { PlannerMockup } from './mockups/PlannerMockup';
import { FocusMockup } from './mockups/FocusMockup';
import { GoalsMockup } from './mockups/GoalsMockup';
import { DocsMockup } from './mockups/DocsMockup';
import { ACCENT } from './mockups/tokens';

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
      'Filters, search, and saved views',
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
      'Ambient sounds and focus playlists',
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

const WHEEL_THRESHOLD = 30;

export function FeatureShowcase() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const wheelLockRef = useRef<boolean>(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Section-in-view gate for keyboard + wheel handlers.
  // `-40% 0px -40% 0px` means the section is only considered "in view"
  // when it occupies the middle 20% of the viewport — this makes the
  // scroll hijack activate when the showcase is near the CENTER of the
  // screen, not when it's just peeking in at the top.
  const sectionInView = useInView(sectionRef, {
    margin: '-40% 0px -40% 0px',
    once: false,
  });

  // Navigate to a specific slide (horizontal on desktop, vertical on mobile).
  // IMPORTANT: we do NOT call setActiveIndex here — that's owned solely by
  // the IntersectionObserver below. Setting it here caused a flicker
  // (optimistic set → observer re-fires for outgoing slide → set again).
  const goToSlide = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(index, SLIDES.length - 1));
    const isHorizontal = window.matchMedia('(min-width: 768px)').matches;
    if (isHorizontal) {
      track.scrollTo({
        left: track.clientWidth * clamped,
        behavior: 'smooth',
      });
    } else {
      track.scrollTo({
        top: track.clientHeight * clamped,
        behavior: 'smooth',
      });
    }
    // Observer will set activeIndex once the new slide crosses the
    // 60% visibility threshold. Single source of truth.
  }, []);

  // Single source of truth for activeIndex: the slide that's >= 60%
  // visible inside the track wins. Higher threshold prevents the brief
  // "both slides visible" transition from firing for the wrong slide.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number(
            (entry.target as HTMLElement).dataset.slideIndex ?? '0',
          );
          setActiveIndex(idx);
        }
      },
      { root: track, threshold: 0.6 },
    );

    slideRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  // Wheel handler: map vertical (or horizontal) wheel delta to slide nav.
  // At the boundaries, we DON'T preventDefault so the page scrolls on to
  // the next section. Uses a short lock to prevent rapid-fire advancement
  // from a single high-momentum scroll.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    if (!sectionInView) return;

    // Mobile uses native vertical snap — no JS wheel hijacking
    const isHorizontal = window.matchMedia('(min-width: 768px)').matches;
    if (!isHorizontal) return;

    const handleWheel = (e: WheelEvent) => {
      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;

      const atStart = activeIndex === 0 && delta < -WHEEL_THRESHOLD;
      const atEnd =
        activeIndex === SLIDES.length - 1 && delta > WHEEL_THRESHOLD;

      // At boundaries: release — let the page scroll naturally to the
      // previous/next section.
      if (atStart || atEnd) return;

      if (Math.abs(delta) < WHEEL_THRESHOLD) return;

      // Prevent page-level scroll while navigating between slides
      e.preventDefault();

      if (wheelLockRef.current) return;
      wheelLockRef.current = true;
      window.setTimeout(() => {
        wheelLockRef.current = false;
      }, 450);

      if (delta > 0) goToSlide(activeIndex + 1);
      else goToSlide(activeIndex - 1);
    };

    // passive: false is REQUIRED so preventDefault() works.
    track.addEventListener('wheel', handleWheel, { passive: false });
    return () => track.removeEventListener('wheel', handleWheel);
  }, [activeIndex, sectionInView, goToSlide]);

  // Arrow keys (global) — gated by sectionInView, ignored inside inputs.
  useEffect(() => {
    if (!sectionInView) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if ((e.target as HTMLElement | null)?.isContentEditable) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (activeIndex < SLIDES.length - 1) {
          e.preventDefault();
          goToSlide(activeIndex + 1);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (activeIndex > 0) {
          e.preventDefault();
          goToSlide(activeIndex - 1);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeIndex, sectionInView, goToSlide]);

  const activeSlide = SLIDES[activeIndex] ?? SLIDES[0]!;
  const progress = (activeIndex + 1) / SLIDES.length;

  return (
    <section
      ref={sectionRef}
      id="features"
      aria-label="Feature showcase"
      className="relative"
    >
      {/* Section heading */}
      <div className="text-center pt-16 md:pt-24 pb-8 md:pb-12 px-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-3">
          Everything you need
        </p>
        <h2 className="font-display text-2xl md:text-3xl font-medium text-foreground tracking-[-0.035em]">
          Six views. One workspace.
        </h2>
      </div>

      <CursorZone label="Swipe" color={activeSlide.accent}>
        <div
          ref={trackRef}
          data-lenis-prevent
          className="feature-snap-track"
          role="region"
          aria-roledescription="carousel"
          aria-label="Lumina features"
          tabIndex={0}
        >
          {SLIDES.map((slide, i) => (
            <div
              key={slide.key}
              ref={(el) => {
                slideRefs.current[i] = el;
              }}
              data-slide-index={i}
              className="feature-snap-slide"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${SLIDES.length}: ${slide.title}`}
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
        </div>
      </CursorZone>

      {/* Navigation: dots + progress + counter */}
      <div className="flex flex-col items-center gap-3 pt-4 pb-12 md:pb-20">
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

        {/* Progress bar */}
        <div className="w-40 md:w-56 h-0.5 rounded-full overflow-hidden bg-border">
          <motion.div
            className="h-full rounded-full"
            style={{ background: activeSlide.accent, transformOrigin: 'left' }}
            animate={{ scaleX: progress }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>

        {/* Counter */}
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
          <span className="text-muted-foreground/50">/</span>
          <span className="text-muted-foreground/50 tabular-nums">
            {String(SLIDES.length).padStart(2, '0')}
          </span>
        </div>
      </div>
    </section>
  );
}
