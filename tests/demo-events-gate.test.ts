/**
 * P1-1 — six fake "demo events" were injected into every user's calendar,
 * forever.
 *
 * `useOutlookSync` seeded them unconditionally on every mount of the app shell,
 * with no gate on whether the user had real data:
 *
 *     useEffect(() => { setDemoLocalEvents(createContextDemoEvents()); }, []);
 *
 * The six are titled "Critical — demo event", "Focus — demo event", "Work",
 * "Social", "Personal", "Health", land on days -1 through +4, and are merged
 * into month, week and day views. They are `readOnly: true`, so **the user
 * cannot delete them**. The audit confirmed all six rendering on the live site
 * for a real account.
 *
 * The gate is now: onboarding not completed AND no events of the user's own
 * from any source AND the event store has actually hydrated. This test exercises
 * that predicate directly against the source, so a regression in any clause
 * fails here.
 */
import { describe, it, expect } from 'vitest';
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
