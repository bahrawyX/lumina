/**
 * P2-15 — `prefers-reduced-motion` was honoured on the marketing site and
 *         nowhere inside the app.
 * P2-16 — the calendar was not navigable or announceable by screen reader.
 *
 * `useReducedMotion()` appeared only under `src/components/landing/**` while 93
 * files import framer-motion, and `src/app/globals.css` carried exactly one
 * reduced-motion rule covering exactly one utility class. For users with
 * vestibular disorders that is the difference between usable and unusable —
 * and the landing page proves the team already knows how to do it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

const globals = read('app', 'globals.css');
const appShell = read('app', '(app)', 'AppShell.tsx');
const useLottie = read('hooks', 'useLottie.ts');
const monthView = read('components', 'MonthView.tsx');
const weekView = read('components', 'WeekView.tsx');

describe('P2-15 — reduced motion reaches the whole app', () => {
  it('the CSS rule covers every element, not one utility class', () => {
    const block = globals.slice(globals.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toMatch(/\*,\s*\n\s*\*::before,\s*\n\s*\*::after/);
    expect(block).toContain('animation-iteration-count: 1 !important');
    expect(block).toContain('transition-duration: 0.01ms !important');
  });

  it('uses 0.01ms rather than 0', () => {
    // A zero-duration animation never fires `animationend`/`transitionend`, so
    // any component waiting on one to unmount or advance hangs forever.
    const block = globals.slice(globals.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).not.toMatch(/animation-duration:\s*0(s|ms)?\s*!important/);
    expect(block).toContain('animation-duration: 0.01ms !important');
  });

  it('framer-motion respects the OS setting across all 93 importing files', () => {
    // One wrapper, so a component added tomorrow inherits it.
    expect(appShell).toContain('MotionConfig');
    expect(appShell).toContain('reducedMotion="user"');
  });

  it('the wrapper is the root of the shell, not a leaf', () => {
    expect(appShell).toMatch(/<MotionConfig reducedMotion="user">/);
    expect(appShell).toContain('</MotionConfig>');
    // The infinite-rotation hydration spinner is the first thing inside it.
    expect(appShell.indexOf('<MotionConfig')).toBeLessThan(
      appShell.indexOf('repeat: Infinity'),
    );
  });

  it('imperative Lottie playback is gated too, not just autoplay', () => {
    // `autoplay`/`loop` already checked the preference, but `playTrigger` calls
    // `play()` directly — so celebrations still ran at full strength.
    expect(useLottie).toMatch(/const play = useCallback\(\(\) => \{/);
    expect(useLottie).toContain('animRef.current?.goToAndStop(0, true)');
    expect(useLottie).toMatch(/goToAndStop\(frame, true\)/);
  });
});

describe('P2-16 — the month grid has the row layer ARIA requires', () => {
  it('wraps each week in role="row"', () => {
    // ARIA grid is grid > row > gridcell. Without the row layer a screen reader
    // cannot announce row/column position, which is the primary way a
    // non-sighted user reads a month view.
    expect(monthView).toContain('role="row"');
    expect(monthView).toContain('aria-rowindex={weekIdx + 2}');
  });

  it('keeps the CSS grid intact with display: contents', () => {
    // The row element generates no box, so its seven children stay direct grid
    // items. Verified in a browser: all 42 cells keep identical geometry, and
    // the row wrappers measure 0px tall.
    expect(monthView).toContain("style={{ display: 'contents' }}");
  });

  it('marks the weekday labels as column headers', () => {
    expect(monthView).toContain('role="columnheader"');
    expect(monthView).toContain('aria-colindex={colIdx + 1}');
  });

  it('declares the grid dimensions and names the month', () => {
    expect(monthView).toContain('aria-rowcount={7}');
    expect(monthView).toContain('aria-colcount={7}');
    expect(monthView).toMatch(/aria-label=\{`\$\{MONTHS\[currentDate\.getMonth\(\)\]\}/);
  });
});

describe('P2-16 — the month grid is one tab stop, not 42', () => {
  it('rovings the tab index instead of making every cell tabbable', () => {
    // Tabbing through a month cost up to 42 stops before reaching anything else.
    expect(monthView).toContain('tabIndex={isActive ? 0 : -1}');
    expect(monthView).not.toContain('tabIndex={0}\n');
  });

  it('handles the arrow keys, Home/End and PageUp/PageDown', () => {
    // `onKeyDown` previously handled only Enter and Space, so there was no way
    // to move by week at all.
    for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'PageUp', 'PageDown']) {
      expect(monthView, key).toContain(`case '${key}':`);
    }
  });

  it('clamps month paging so the 31st does not skip a month', () => {
    // `new Date(2026, 1, 31)` is 3 March.
    expect(monthView).toContain('Math.min(d, 28)');
  });

  it('moves the month when navigation steps off its edge', () => {
    // Otherwise the arrow key lands on an out-of-month cell, which is
    // `pointer-events: none` and inert.
    expect(monthView).toContain('setCurrentDate(next)');
  });

  it('never steals focus on mount', () => {
    // Focus follows the roving index only after a keyboard move.
    expect(monthView).toContain('pendingFocus');
    expect(monthView).toMatch(/pendingFocus\.current = null;/);
  });

  it('still opens a day with Enter or Space', () => {
    expect(monthView).toContain("e.key === 'Enter' || e.key === ' '");
  });
});

describe('P2-16 — the week grid announces its columns', () => {
  it('has a header row with column headers', () => {
    expect(weekView).toContain('role="row"');
    expect(weekView).toContain('role="columnheader"');
    expect(weekView).toContain('aria-colindex={idx + 2}');
  });

  it('uses role="none" on the layout wrapper, not display: contents', () => {
    // That wrapper carries `flex-1` and the 7-column grid; collapsing its box
    // would leave the seven day headers as unequal flex items. Presentation
    // role re-parents the headers in the accessibility tree without touching
    // the layout.
    expect(weekView).toContain('className="flex-1 grid grid-cols-7" role="none"');
  });

  it('accounts for the time gutter in the column count', () => {
    expect(weekView).toContain('aria-colcount={8}');
    expect(weekView).toContain('aria-colindex={1}');
  });
});

describe('P2-16 — the last Radix sheet without a description', () => {
  it('GoalDetailSheet has one', () => {
    const sheet = read('components', 'goals', 'GoalDetailSheet.tsx');
    expect(sheet).toContain('SheetDescription');
    expect(sheet).toContain('Goal details, targets and progress');
  });
});
