/**
 * The guest → account path, which three separate fixes had left broken end to
 * end:
 *
 *  - F5.1 walled `/onboarding`, the only route from which guest mode can be
 *    entered, so nothing downstream could ever run (covered in
 *    `route-protection.test.ts`);
 *  - F6.3's migration was gated on `isGuest`, which F6.4 cleared before the
 *    component that reads it mounts;
 *  - F8.1's hydration used `||`, so a guest's finished onboarding carried into
 *    the fresh account they signed up for (covered in
 *    `onboarding-persistence.test.ts`).
 *
 * These read source rather than mounting React: the defect is entirely about
 * WHICH value the effect keys on, and mounting the real `PersistenceBootstrap`
 * would mean standing up better-auth, nine stores and a dozen fetches to
 * observe one boolean.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

/** Strip comments, so a test never matches the prose explaining the fix. */
const codeOf = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

describe('F6.3 — guest data actually gets imported', () => {
  const code = codeOf(read('src/components/PersistenceBootstrap.tsx'));

  it('keys the import on the presence of data, not on the isGuest flag', () => {
    // All three sign-in handlers call `clearGuestSession()` BEFORE
    // `router.replace(destination)`, so `isGuest` is already false by the time
    // this component mounts on the destination route. `if (!isGuest) return;`
    // bailed on its first line every time — on the exact route both upgrade
    // CTAs link to.
    expect(code).toContain('if (!hasGuestData()) return;');
    expect(code).not.toContain('if (!isGuest) return;');
  });

  it('still runs the migration, and still clears the flag afterwards', () => {
    expect(code).toContain('void migrateGuestData()');
    expect(code).toContain('clearGuestSession();');
  });

  it('imports the guard it now depends on', () => {
    expect(code).toContain("import { hasGuestData } from '@/lib/persistence/guestStorage';");
  });

  it('is safe to re-run, because the migration short-circuits on empty', () => {
    // The new gate can fire on any authenticated mount, including ones after a
    // successful import. That is only acceptable because the migration is
    // idempotent by construction.
    expect(read('src/lib/persistence/guestMigration.ts')).toContain(
      'if (!hasGuestData()) return EMPTY;',
    );
  });

  it('and the sign-in page still clears the flag early, which is correct', () => {
    // This is not the thing to revert: you stop being a guest the moment you
    // sign in, and `clearGuestSession` deliberately KEEPS the local data so the
    // import can still find it. The flag was simply the wrong thing to key on.
    const signin = codeOf(read('src/app/auth/signin/page.tsx'));
    expect(signin).toContain('clearGuestSession()');

    const store = read('src/store/useGuestStore.ts');
    expect(store).toContain('clearGuestSession: () => set({ isGuest: false');
    // The data-destroying variant must stay a separate, explicit action.
    expect(store).toContain('abandonGuestData');
  });
});

describe('the guest entry point is reachable at all', () => {
  it('enterGuestMode still has exactly one deliberate call site', () => {
    // F6.5 reduced this to one on purpose. If it grows, the "guest mode is
    // entered only from the two-step confirm" guarantee is gone.
    const flow = codeOf(read('src/components/OnboardingFlow.tsx'));
    const calls = flow.match(/\benterGuestMode\(\)/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it('and it lives on a route the proxy does not wall', () => {
    const proxySrc = read('src/proxy.ts');
    const list = proxySrc.slice(
      proxySrc.indexOf('const PROTECTED_PREFIXES'),
      proxySrc.indexOf('] as const;'),
    );
    expect(list).not.toContain("'/onboarding'");
    // The matcher has to agree, or the prefix list is decorative.
    expect(proxySrc).not.toContain("'/onboarding/:path*'");
  });
});
