/**
 * F2.1 — two independently maintained auth implementations, already diverging.
 * F2.2 — the auth mode wasn't in the URL.
 * F2.3 — the two guest-conversion CTAs went to different places.
 * F3.15 — submit re-enabled before navigation completed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

const form = read('components', 'auth', 'EmailAuthForm.tsx');
const page = read('app', 'auth', 'signin', 'page.tsx');
const onboarding = read('components', 'OnboardingFlow.tsx');

/** Comments quote the patterns they replaced, so match against code only. */
const codeOf = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

describe('F2.1 — there is one form, not two', () => {
  it('both surfaces render it', () => {
    expect(codeOf(page)).toContain('<EmailAuthForm');
    expect(codeOf(onboarding)).toContain('<EmailAuthForm');
  });

  it('neither keeps its own field machinery', () => {
    // Each had its own tab strip, AuthField, inputCls, validate, handleSubmit
    // and error rendering, duplicated near-verbatim.
    for (const [name, src] of [['signin page', page], ['onboarding', onboarding]] as const) {
      const code = codeOf(src);
      expect(code, name).not.toContain('const inputCls =');
      expect(code, name).not.toContain('const validate = (): boolean =>');
      expect(code, name).not.toContain('const AuthField:');
    }
  });

  it('the three divergences the audit found are now impossible', () => {
    const code = codeOf(form);

    // 1. Password autofill — onboarding was right, the signin page was not.
    expect(code).toContain("autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}");

    // 2 and 3 are caller concerns by design, but they must be reachable: the
    // form takes children so each surface can add what it genuinely needs.
    expect(code).toContain('{children}');
    expect(code).toContain('{belowFields}');
  });

  it('the guest flag is cleared however the account was created (F6.4)', () => {
    // The signin page cleared it inline; onboarding never did, so a guest who
    // converted THERE stayed flagged as a guest forever — the banner kept
    // telling a registered user their data was browser-only, and
    // `/onboarding` re-ran the whole flow on every visit.
    //
    // Rather than adding a second inline call (which is how the two
    // implementations drifted in the first place), the durable fix is the
    // session-keyed effect in `PersistenceBootstrap`: it fires whenever a user
    // id appears while `isGuest` is set, migrates the guest's data, and clears
    // the flag — so it covers every sign-in path including ones not written
    // yet.
    const bootstrap = read('components', 'PersistenceBootstrap.tsx');
    expect(bootstrap).toContain('clearGuestSession');
    expect(bootstrap).toContain('migrateGuestData()');
    expect(bootstrap).toContain('}, [session?.user?.id, sessionPending]);');

    // The signin page's inline call stays — it is the fast path, and clearing
    // twice is idempotent.
    expect(codeOf(page)).toContain('clearGuestSession()');
  });

  it('the shared form carries the a11y wiring both surfaces now get', () => {
    const code = codeOf(form);
    expect(code).toContain('<form onSubmit={handleSubmit}');
    expect(code).toContain("'aria-describedby'");
    expect(code).toContain("'aria-invalid'");
    expect(code).toContain('role="alert"');
    expect(code).toContain("document.getElementById(`auth-${first}`)?.focus()");
  });
});

describe('F2.2 — the mode is in the URL', () => {
  const code = codeOf(page);

  it('reads it from the search params rather than local state', () => {
    // `useState('signin')` meant `?mode=signup` did nothing, nobody could be
    // linked to the sign-up form, and Back left the app.
    expect(code).toContain("searchParams.get('mode') === 'signup' ? 'signup' : 'signin'");
    expect(code).not.toContain("useState<AuthMode>('signin')");
  });

  it('pushes rather than replaces, so Back returns to the other tab', () => {
    // Verified in a browser: tapping "Create account" gives `?mode=signup`, and
    // Back returns to Sign in on the same page instead of leaving the app —
    // which was the audit's actual complaint. `replace` would not fix it.
    expect(code).toContain('router.push(`/auth/signin${');
  });

  it('drops the param rather than writing ?mode=signin', () => {
    expect(code).toContain("params.delete('mode')");
  });
});

describe('F2.3 — both guest CTAs go to the same place', () => {
  const banner = read('components', 'auth', 'GuestBanner.tsx');
  const modal = read('components', 'auth', 'GuestUpgradeModal.tsx');

  it('both open the sign-up tab', () => {
    // Same intent, two destinations, two different forms — and the banner's
    // link landed on the SIGN IN tab despite saying "Create an account".
    expect(banner).toContain('href="/auth/signin?mode=signup"');
    expect(modal).toContain('href="/auth/signin?mode=signup"');
  });

  it('neither still points at /onboarding', () => {
    expect(codeOf(modal)).not.toContain('href="/onboarding"');
  });
});

describe('F3.15 — submit stays disabled through the navigation', () => {
  const code = codeOf(page);

  it('does not clear busy on the success path', () => {
    // `finally { setBusy(null) }` ran immediately after `router.replace`, and
    // the client transition takes hundreds of milliseconds — during which the
    // button was live again with its label reset, so a fast second click fired
    // a second request.
    const successReturns = code.match(/router\.replace\(destination\);\s*\n\s*return;/g) ?? [];
    expect(successReturns.length).toBeGreaterThanOrEqual(3);
  });

  it('still redirects from an effect, not during render', () => {
    // Calling `router.replace()` inline double-fires under React 19 +
    // reactStrictMode and warns about updating a component while rendering
    // another.
    expect(code).toContain('if (alreadySignedIn) router.replace(destination);');
    expect(code).toContain('}, [alreadySignedIn, router, destination]);');
  });
});
