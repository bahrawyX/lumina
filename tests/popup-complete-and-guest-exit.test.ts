/**
 * F4.3 (the opener-less half) and F6.4.
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

describe('F4.3 — a callback with no opener is not a dead end', () => {
  const page = codeOf(read('src/app/auth/popup-complete/page.tsx'));

  it('does not simply bail when window.opener is null', () => {
    // `if (!window.opener) return;` was the whole story. `window.opener` is
    // null for a popup blocker's open-in-a-new-tab fallback, for a provider
    // that round-trips through a rel=noopener intermediary, and under COOP. In
    // every one of those the sign-in succeeded and the cookie is set — and the
    // user was left on a terminal page telling them to close what is actually
    // their only tab.
    expect(page).not.toContain('if (!window.opener) return;');
    expect(page).toContain("setMode('standalone')");
    expect(page).toContain('window.location.replace(next)');
  });

  it('sanitises the destination rather than trusting ?next', () => {
    // F8.2's sanitizer returns null for anything not a rooted same-origin
    // path, so the fallback has to be a literal.
    expect(page).toContain("sanitizeNextDestination(searchParams.get('next')) ?? '/calendar'");
  });

  it('does not redirect on an error callback', () => {
    // Bouncing a failed sign-in into the app produces a 401 loop.
    const effect = page.slice(page.indexOf('useEffect(() => {'), page.indexOf('}, [provider'));
    expect(effect).toContain('if (hasError) return;');
  });

  it('stops claiming success when the callback reported an error', () => {
    // It rendered "Authentication complete" unconditionally, including for
    // `?error=true`.
    expect(page).toContain('hasError ? (');
    expect(page).toContain("Sign-in didn");
  });

  it('still posts the message and closes when it IS a popup', () => {
    expect(page).toContain("type: 'lumina:oauth-complete'");
    expect(page).toContain('window.location.origin');
    expect(page).toContain('window.close();');
  });
});

describe('F6.4 — guest mode ends on every sign-in surface', () => {
  const onboarding = codeOf(read('src/components/OnboardingFlow.tsx'));

  it('both OnboardingFlow auth handlers clear the guest flag', () => {
    // It was on the sign-in page and on sign-out, but not here — and
    // `/onboarding` does not mount `PersistenceBootstrap`, so a guest who
    // created an account on this page stayed flagged as a guest for the whole
    // page, with the banner telling them their work was local-only while it
    // was being saved to their new account.
    const calls = onboarding.match(/useGuestStore\.getState\(\)\.clearGuestSession\(\);/g) ?? [];
    expect(calls).toHaveLength(2);
  });

  it('uses the data-preserving exit, not the destructive one', () => {
    // `abandonGuestData` deletes the local records; the import needs them.
    expect(onboarding).not.toContain('abandonGuestData()');
  });

  it('and the import path still works regardless of the flag', () => {
    // Belt and braces with the F6.3 fix: even if a surface forgets to clear
    // the flag, the migration keys on the data.
    expect(codeOf(read('src/components/PersistenceBootstrap.tsx'))).toContain(
      'if (!hasGuestData()) return;',
    );
  });
});
