/**
 * P1-1 — six fake "demo events" were injected into every user's calendar,
 * forever.
 *
 * `useOutlookSync` seeded them unconditionally on every mount of the app shell,
 * with no gate on whether the user had real data:
 *
 *     useEffect(() => { setDemoLocalEvents(createContextDemoEvents()); }, []);
 *
 * The six land on days -1 through +4 and are merged into month, week and day
 * views. They are `readOnly: true`, so **the user cannot delete them**. The
 * audit confirmed all six rendering on the live site for a real account.
 *
 * They were titled `Critical — demo event`, `Focus — demo event` and so on.
 * They are now `Test (Critical)`, `Test (Focus)` — see the labelling block at
 * the bottom of this file for why the word order changed.
 *
 * The gate is now: onboarding not completed AND no events of the user's own
 * from any source AND the event store has actually hydrated. This test exercises
 * that predicate directly against the source, so a regression in any clause
 * fails here.
 */
import { describe, it, expect } from 'vitest';
import { createContextDemoEvents } from '@/hooks/useOutlookSync';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(process.cwd(), 'src', 'hooks', 'useOutlookSync.ts'),
  'utf8',
);

/**
 * The predicate as implemented, mirrored here so each clause can be exercised
 * independently. `assertGateMatchesSource` below fails if the implementation
 * stops containing any of these guards.
 */
function shouldSeedDemos(state: {
  eventsHydrated: boolean;
  onboardingCompleted: boolean;
  ownEventCount: number;
  externalEventCount: number;
  alreadySeeded: boolean;
}): boolean {
  if (state.alreadySeeded) return false;
  if (!state.eventsHydrated) return false;
  if (state.onboardingCompleted) return false;
  if (state.ownEventCount > 0) return false;
  if (state.externalEventCount > 0) return false;
  return true;
}

const BRAND_NEW = {
  eventsHydrated: true,
  onboardingCompleted: false,
  ownEventCount: 0,
  externalEventCount: 0,
  alreadySeeded: false,
};

describe('P1-1 — demo events are seeded only for a genuinely empty first run', () => {
  it('seeds for a brand-new, un-onboarded, empty calendar', () => {
    expect(shouldSeedDemos(BRAND_NEW)).toBe(true);
  });

  it('does NOT seed for a user who has completed onboarding', () => {
    // This is the case that hit every real account.
    expect(shouldSeedDemos({ ...BRAND_NEW, onboardingCompleted: true })).toBe(false);
  });

  it('does NOT seed for a user with events of their own', () => {
    expect(shouldSeedDemos({ ...BRAND_NEW, ownEventCount: 1 })).toBe(false);
  });

  it('does NOT seed for a user with connected-calendar events', () => {
    expect(shouldSeedDemos({ ...BRAND_NEW, externalEventCount: 3 })).toBe(false);
  });

  it('does NOT seed before the event store has hydrated', () => {
    // Without this clause the check runs against an empty store while the
    // fetch is still in flight, which seeds everyone — exactly the original bug
    // wearing a gate.
    expect(shouldSeedDemos({ ...BRAND_NEW, eventsHydrated: false })).toBe(false);
  });

  it('seeds at most once per mount', () => {
    expect(shouldSeedDemos({ ...BRAND_NEW, alreadySeeded: true })).toBe(false);
  });
});

describe('P1-1 — the implementation still carries every guard', () => {
  it('no longer seeds from an unconditional empty-dependency effect', () => {
    const unconditional = /useEffect\(\(\)\s*=>\s*\{\s*setDemoLocalEvents\(createContextDemoEvents\(\)\);?\s*\}/;
    expect(SOURCE).not.toMatch(unconditional);
  });

  for (const guard of [
    'if (demoSeeded.current) return;',
    'if (!eventsHydrated) return;',
    'if (onboardingCompleted) return;',
    'if (ownEventCount > 0) return;',
    'if (externalEventCount > 0) return;',
  ]) {
    it(`retains the guard: ${guard}`, () => {
      expect(SOURCE).toContain(guard);
    });
  }

  it('clears the demos once the user has real data', () => {
    // Otherwise the undeletable examples sit alongside real work forever.
    expect(SOURCE).toContain('setDemoLocalEvents([]);');
  });
});

/**
 * The gate above decides WHETHER they appear. This decides whether someone who
 * sees one can tell it apart from their own event.
 *
 * The old titles put the context first — `Critical — demo event` — and a month
 * cell has room for about two words, so what actually rendered was "Critical".
 * That is indistinguishable from a real event, which is how six unremovable
 * fake entries got reported as "events I didn't create". Leading with "Test"
 * puts the disposable word in the part that always survives truncation.
 *
 * Asserted against the real objects rather than a regex over the source. The
 * gate tests above read `useOutlookSync.ts` as text because they are checking
 * the shape of a hook body, which cannot be called outside React — but the
 * factory is a plain function, so there is no reason to guess at its output
 * when it can simply be run.
 */
describe('a demo event announces itself even when the title is clipped', () => {
  const events = createContextDemoEvents();

  it('produces one per built-in context', () => {
    expect(events).toHaveLength(6);
  });

  it('leads every title with the word that gives it away', () => {
    // The first word is the one that survives a truncated month cell.
    for (const e of events) {
      expect(e.title.split(/[\s(]/)[0], `"${e.title}" does not lead with Test`).toBe('Test');
    }
  });

  it('still names the context each one is demonstrating', () => {
    // Showing what each context looks like is the entire point of having six.
    expect(events.map((e) => e.title)).toEqual([
      'Test (Critical)',
      'Test (Focus)',
      'Test (Work)',
      'Test (Social)',
      'Test (Personal)',
      'Test (Health)',
    ]);
  });

  it('keeps them read-only, which is why the label carries the weight', () => {
    // A user cannot delete these, so the title is the only thing standing
    // between "example content" and "why is this in my calendar".
    for (const e of events) {
      expect(e.readOnly).toBe(true);
      expect(e.draggable).toBe(false);
    }
  });

  it('gives each one a distinct id and context colour', () => {
    expect(new Set(events.map((e) => e.id)).size).toBe(6);
    expect(new Set(events.map((e) => e.color)).size).toBe(6);
  });
});
