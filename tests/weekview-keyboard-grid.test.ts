/**
 * P2-16 — `WeekView` was the calendar's default view and had no keyboard
 * access at all.
 *
 * `MonthView` and `GoalDetailSheet` were given the ARIA grid treatment;
 * `WeekView` was not. `grep -n "tabIndex\|onKeyDown" src/components/WeekView.tsx`
 * returned nothing across the whole file, and its day columns carried
 * `role="gridcell"` inside a container with no `role="row"` — an invalid grid,
 * so a screen reader could not report a position even for a mouse user.
 *
 * These read source. Driving the real component needs a session, a populated
 * calendar store and the event engine; the defect is structural, and the
 * structure is what these pin.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const codeOf = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

const week = codeOf(read('src/components/WeekView.tsx'));

describe('P2-16 — WeekView is a valid ARIA grid', () => {
  it('every gridcell has an owning row', () => {
    // `role="gridcell"` inside a plain div is not a grid position.
    expect(week).toContain('role="gridcell"');
    expect(week).toContain('role="row"');
    // Header row is 1, the day canvas is 2.
    expect(week).toContain('aria-rowindex={1}');
    expect(week).toContain('aria-rowindex={2}');
  });

  it('the day columns declare their column index', () => {
    // Column 1 is the time gutter, so the days start at 2 — matching the
    // `aria-colindex` the header columns already use.
    expect(week).toContain('aria-colindex={dayIdx + 2}');
    expect(week).toContain('aria-colcount={8}');
  });

  it('and each announces what it contains, not just that it exists', () => {
    expect(week).toMatch(/aria-label=\{`\$\{DAYS\[date\.getDay\(\)\]\}/);
    expect(week).toContain('event${dayEvents.length === 1');
  });
});

describe('P2-16 — and it is reachable from the keyboard', () => {
  it('has a roving tabindex rather than seven tab stops or none', () => {
    // Zero `tabIndex` in the file before this. Seven would be the other
    // failure — the ARIA grid pattern is exactly one tabbable cell.
    expect(week).toContain('tabIndex={dayIdx === activeDayIdx ? 0 : -1}');
    expect(week).toContain('data-day-index={dayIdx}');
  });

  it('handles the arrow keys, Home/End and PageUp/PageDown', () => {
    const handler = week.slice(
      week.indexOf('const handleGridKeyDown'),
      week.indexOf('const handleAddNewFromConflict'),
    );
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End', 'PageUp', 'PageDown']) {
      expect(handler, key).toContain(`'${key}'`);
    }
  });

  it('pages the week when moving off either end', () => {
    // Otherwise a keyboard user is trapped inside one week and has to reach
    // for the header buttons to go anywhere.
    const handler = week.slice(week.indexOf('const move = (delta'), week.indexOf('switch (e.key)'));
    expect(handler).toContain('setCurrentDate(shifted)');
    expect(handler).toContain('next < 0 ? -7 : 7');
  });

  it('does something on Enter, rather than being reachable and inert', () => {
    expect(week).toContain("case 'Enter':");
    expect(week).toContain('openNewEventAtMinute(formatDateISO(day), 9 * 60)');
  });

  it('only steals focus after a deliberate keyboard move', () => {
    // Focusing on mount would yank the user out of wherever they actually are.
    expect(week).toContain('pendingFocusIdx');
    expect(week).toContain('pendingFocusIdx.current = null;');
  });

  it('the handler is bound to the grid, not to each cell', () => {
    // Seven listeners for one behaviour is how they drift apart.
    const bindings = week.match(/onKeyDown=\{handleGridKeyDown\}/g) ?? [];
    expect(bindings).toHaveLength(1);
  });

  it('and the focused column is visibly focused', () => {
    // Depends on P0-4: `box-shadow: none !important` on `*:focus` used to kill
    // every ring in the app, so an outline utility here would have done
    // nothing.
    expect(week).toContain('focus-visible:outline-2');
    const globals = read('src/app/globals.css');
    expect(globals).toContain('*:focus:not(:focus-visible)');
  });
});
