/**
 * P3-6 — `tsconfig.json` had `strict: false`.
 *
 * No `strictNullChecks`, no `noImplicitAny`. In a codebase built on
 * `array.find()` and optional API fields, the compiler could not see any of the
 * `undefined` paths.
 *
 * Turning it on cost 17 errors across 8 files, and every one was a real
 * `undefined` the compiler had been hiding — a drag handler dereferencing a
 * pointer it never checked, a goal ring handler dereferencing a target that is
 * `undefined` whenever the goal has more than one, three template fields
 * interpolating `undefined` into a document body.
 *
 * This test exists so the flag cannot quietly go back off: a future
 * `strict: false` fails here rather than at the next audit.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const tsconfig = JSON.parse(
  readFileSync(join(process.cwd(), 'tsconfig.json'), 'utf8'),
) as { compilerOptions: Record<string, unknown> };

const src = (...parts: string[]) => readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

describe('P3-6 — strict mode stays on', () => {
  it('is enabled in tsconfig', () => {
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it('is not re-disabled piecemeal', () => {
    // `strict: true` with `strictNullChecks: false` underneath it would pass
    // the check above and reopen the whole finding.
    for (const flag of [
      'strictNullChecks',
      'noImplicitAny',
      'strictFunctionTypes',
      'strictBindCallApply',
      'noImplicitThis',
      'useUnknownInCatchVariables',
      'alwaysStrict',
      'strictPropertyInitialization',
    ]) {
      expect(tsconfig.compilerOptions[flag], flag).not.toBe(false);
    }
  });

  it('did not buy the flag with suppressions', () => {
    // The codebase had ZERO `@ts-ignore`/`@ts-expect-error` before this change.
    // Turning strict on by adding them would be worse than leaving it off.
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) files.push(full);
      }
    };
    walk(join(process.cwd(), 'src'));

    const suppressed = files.filter((f) => {
      const text = readFileSync(f, 'utf8');
      return text.includes('@ts-ignore') || text.includes('@ts-expect-error');
    });
    expect(suppressed).toEqual([]);
  });
});

describe('P3-6 — the undefined paths strict mode exposed', () => {
  it('the drag handlers check the pointer they dereference', () => {
    // `pointer` is set in the same `startDrag` call as `origin`, but the guard
    // checked only `origin` — nothing proved the invariant.
    for (const view of ['DayView.tsx', 'WeekView.tsx']) {
      expect(src('components', view), view).toContain('!dragState.pointer) return;');
    }
  });

  it('the goal ring handler returns for a goal it cannot edit', () => {
    // `editableRingTarget` is `Target | null | undefined`; `undefined` means
    // "more than one target, so the ring is not directly editable". The handler
    // checked `=== null` and then dereferenced `.type`.
    expect(src('components', 'goals', 'GoalDetailSheet.tsx')).toContain(
      'if (editableRingTarget === undefined) return;',
    );
  });

  it('the meeting-notes template cannot interpolate undefined', () => {
    // `formData` is `Partial<CalendarEvent>`, and the note body writes
    // `Date: ${eventDate}` straight into the document.
    const modal = src('components', 'EventModal.tsx');
    expect(modal).toContain("eventDate={formData.date ?? ''}");
    expect(modal).toContain("eventStartTime={formData.startTime ?? ''}");
    expect(modal).toContain("eventEndTime={formData.endTime ?? ''}");
  });

  it('social providers narrow on the values, not a derived boolean', () => {
    // A `boolean` const does not carry its narrowing into the spread below, so
    // both credentials stayed `string | undefined` at the call site.
    const auth = src('lib', 'auth.ts');
    expect(auth).toContain('...(googleClientId && googleClientSecret');
    expect(auth).toContain('...(microsoftClientId && microsoftClientSecret');
  });

  it('the recurrence PATCH captures the narrowed rrule', () => {
    const route = src('app', 'api', 'events', '[id]', 'route.ts');
    expect(route).toContain('const nextRrule =');
    expect(route).toContain('if (nextRrule !== null) {');
  });

  it('nullable columns are mapped to the optional domain field', () => {
    // `events.category` is nullable; `IntelligenceCalendarEvent.category` is
    // optional. `null` reached the analysis code and the type said it could not.
    expect(src('app', 'api', 'intelligence', 'route.ts')).toContain(
      'category: row.category ?? undefined',
    );
  });
});
