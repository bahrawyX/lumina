/**
 * P3-4 and P3-9(f) — two helpers-that-nothing-used findings.
 *
 * Both had the same shape: the consolidation the audit prescribed was written,
 * and then the duplication it was meant to replace was left in place and kept
 * growing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

/** Every .ts file under src/app/api. */
function apiRoutes(dir = resolve(root, 'src/app/api')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? apiRoutes(join(dir, e.name))
      : e.name.endsWith('.ts')
        ? [join(dir, e.name)]
        : [],
  );
}

/** Every .tsx file under src/components. */
function components(dir = resolve(root, 'src/components')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? components(join(dir, e.name))
      : e.name.endsWith('.tsx')
        ? [join(dir, e.name)]
        : [],
  );
}

describe('P3-4 — the shared error helper is actually used', () => {
  it('no route hand-rolls the 500 response any more', () => {
    // `apiError` was added by the P3-4 fix and had ZERO call sites, while the
    // copy-pasted blocks it was meant to replace went from 52 to 58.
    const offenders = apiRoutes()
      .filter((f) => readFileSync(f, 'utf8').includes("error: 'Internal server error'"))
      .map((f) => f.replace(root, ''));

    expect(offenders).toEqual([]);
  });

  it('and it has real call sites, not one', () => {
    const callers = apiRoutes().filter((f) => /\bapiError\(/.test(readFileSync(f, 'utf8')));
    expect(callers.length).toBeGreaterThan(30);
  });

  it('the helper still logs before it responds', () => {
    // The whole point is that the client gets an opaque message AND the
    // operator gets the cause — P3-3's other half.
    const logger = read('src/lib/logger.ts');
    const fn = logger.slice(logger.indexOf('export function apiError'));
    expect(fn).toContain("logger.error('unhandled'");
    expect(fn).toContain("error: 'Internal server error'");
    expect(fn).toContain('status: 500');
  });

  it('routes that had extra log context kept it', () => {
    // These were the ones the first mechanical pass missed; converting them by
    // dropping their context would have been a regression disguised as cleanup.
    expect(read('src/app/api/tasks/reorder/route.ts')).toMatch(/apiError\([^)]*\{ userId \}\)/);
    expect(read('src/app/api/goals/route.ts')).toContain('pgCode');
  });
});

describe('P3-9(f) — one definition per check glyph', () => {
  it('no component declares its own CheckIcon', () => {
    // Ten declarations existed. Nine were inlined at the point of use.
    const offenders = components()
      .filter((f) => !f.includes(join('components', 'icons')))
      .filter((f) => /const CheckIcon|function CheckIcon/.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(root, ''));

    expect(offenders).toEqual([]);
  });

  it('the three glyphs stayed three glyphs', () => {
    // The nine inline copies were not nine copies of one icon — they were a
    // plain check (x6), a clipboard-check (x2) and a circle-check (x1) sharing
    // a name. Collapsing them into one export would have silently changed two
    // components' iconography.
    const icons = read('src/components/icons/CheckIcons.tsx');
    expect(icons).toContain('export const CheckIcon');
    expect(icons).toContain('export const ClipboardCheckIcon');
    expect(icons).toContain('export const CheckCircleIcon');

    // Each draws something different.
    expect(icons).toContain('points="20 6 9 17 4 12"');
    expect(icons).toContain('M21 12v7a2 2 0 0 1-2 2H5');
    expect(icons).toContain('M22 11.08V12a10 10 0 1 1-5.93-9.14');
  });

  it('the components that used the other two glyphs now say so', () => {
    for (const f of [
      'src/components/dashboard/DailyBriefStrip.tsx',
      'src/components/dashboard/TodaySummaryWidget.tsx',
    ]) {
      expect(read(f), f).toContain('ClipboardCheckIcon');
    }
    expect(read('src/components/GoogleCalendarSync.tsx')).toContain('CheckCircleIcon');
  });

  it('the animated icon is untouched — it is a different component', () => {
    // `UtilityIcons.CheckIcon` is a framer-motion icon on `IconBase` that
    // merely shares the name. Folding it in would have been the real mistake.
    const utility = read('src/components/icons/UtilityIcons.tsx');
    expect(utility).toContain('export const CheckIcon');
    expect(utility).toContain('IconBase');
    expect(utility).toContain('whileHover');
  });

  it('sizes and stroke widths were preserved, not normalised away', () => {
    // The copies ranged 10-18px at three stroke widths. Silently resizing an
    // icon in six places is not a refactor.
    expect(read('src/components/focus/FocusTimer.tsx')).toContain('size={18} strokeWidth={2.5}');
    expect(read('src/components/tasks/TaskFilterBar.tsx')).toContain('size={10} strokeWidth={3}');
    expect(read('src/components/planner/FreeTimePanel.tsx')).toContain('size={13}');
  });
});
