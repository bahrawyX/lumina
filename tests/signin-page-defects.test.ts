/**
 * F3.2, F3.7, F3.12, F3.13, F3.15, F4.4 — six defects on the sign-in surface
 * that survived their own fixes.
 *
 * Four of them are about the difference between what the code does and what
 * the comment above it claims, so several of these read source deliberately:
 * that IS the defect. The behavioural ones drive real functions.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isEmailVerificationPending } from '@/lib/auth/authErrors';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

/** Strip comments, so nothing matches the prose explaining the fix. */
const codeOf = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

const signin = codeOf(read('src/app/auth/signin/page.tsx'));
const onboarding = codeOf(read('src/components/OnboardingFlow.tsx'));

describe('F3.15 — busy really does stay set through the navigation', () => {
  it('the success path is not undone by finally', () => {
    // `finally` runs on `return` too, so `finally { setBusy(null) }` cleared
    // `busy` on EVERY path — while the comment directly above it said "`busy`
    // is deliberately NOT cleared on success". The button re-enabled with its
    // label back to "Create account" for the hundreds of milliseconds the
    // client transition takes, and a fast second click fired a second
    // `signUp.email`.
    expect(signin).not.toContain('} finally {\n      setBusy(null);\n    }');
    expect(signin).toContain('if (!navigating) setBusy(null);');
  });

  it('all three handlers set the flag before navigating', () => {
    // sign-up, sign-in, and the Google popup all end in `router.replace`.
    const flagged = signin.match(/navigating = true;/g) ?? [];
    expect(flagged.length).toBeGreaterThanOrEqual(3);
    const guards = signin.match(/if \(!navigating\) setBusy\(null\);/g) ?? [];
    expect(guards).toHaveLength(3);
  });
});

describe('F3.2 — a new user is not told their address is taken', () => {
  it('recognises the verification-pending failure', () => {
    expect(isEmailVerificationPending({ code: 'EMAIL_NOT_VERIFIED' })).toBe(true);
    expect(isEmailVerificationPending({ code: 'email_not_verified' })).toBe(true);
    expect(isEmailVerificationPending({ message: 'Email not verified' })).toBe(true);
  });

  it('and does not fire on an unrelated failure', () => {
    // Matching loosely here is how F4.5 turned a cancellation into a browser
    // fault; the same mistake here would hide a genuine duplicate address.
    expect(isEmailVerificationPending({ code: 'INVALID_CREDENTIALS' })).toBe(false);
    expect(isEmailVerificationPending({ message: 'Invalid email or password' })).toBe(false);
    expect(isEmailVerificationPending({ message: 'user email not verified yet, retry' })).toBe(false);
    expect(isEmailVerificationPending(null)).toBe(false);
    expect(isEmailVerificationPending(undefined)).toBe(false);
    expect(isEmailVerificationPending('EMAIL_NOT_VERIFIED')).toBe(false);
  });

  it('both surfaces branch on it before claiming the address is registered', () => {
    for (const [name, src] of [['signin', signin], ['onboarding', onboarding]] as const) {
      expect(src, name).toContain('isEmailVerificationPending(signedIn.error)');
      // The ambiguous message is still there — it is correct for the case it
      // was written for, and deliberately does not confirm the address exists.
      expect(src, name).toContain('may already be registered');
    }
  });
});

describe('F3.7 — a thrown request does not leave a silent form', () => {
  it('both OnboardingFlow email handlers have a catch, not just a finally', () => {
    // The sign-in page was fixed for this; OnboardingFlow's two handlers were
    // still `try`/`finally` with no `catch`, so a dropped connection cleared
    // the spinner and showed nothing at all.
    const handlers = onboarding.split('const handleAuth').slice(1, 3);
    expect(handlers).toHaveLength(2);
    for (const h of handlers) {
      const body = h.slice(0, h.indexOf('}, ['));
      expect(body).toContain('} catch {');
      expect(body).toContain("We couldn't reach Lumina");
    }
  });
});

describe('F3.12 — editing a field dismisses the message about it', () => {
  it('the form clears the caller-owned page-level message on input', () => {
    const form = codeOf(read('src/components/auth/EmailAuthForm.tsx'));
    expect(form).toContain('onFieldChange?.();');
    // Still inside clearErr, so every field gets it without three call sites.
    const clearErr = form.slice(form.indexOf('const clearErr'), form.indexOf('const clearErr') + 260);
    expect(clearErr).toContain('onFieldChange?.()');
  });

  it('and both callers pass their clearer', () => {
    expect(signin).toContain('onFieldChange={clearMessage}');
    expect(onboarding).toContain('onFieldChange={onClearAuthMessage}');
  });
});

describe('F4.4 — the popup-blocked fallback goes somewhere that works', () => {
  it('does not navigate to the POST-only auth endpoint', () => {
    // `signInSocial` answers `c.json({url, redirect:true})` at status 200, and
    // browsers do not follow `Location` on a 200 — the route file next door
    // says so, having deleted an identical GET->POST shim for that reason. The
    // user got raw JSON, under a message promising "We'll try again in this tab."
    expect(signin).not.toContain('/api/auth/sign-in/social?provider=google');
  });

  it('resolves the provider URL and navigates the tab to it', () => {
    expect(signin).toContain('await resolveGoogleAuthUrl(destination)');
    // The popup uses the same resolver with a different callback, because a
    // full-page redirect has no opener to postMessage back to.
    expect(signin).toContain("resolveGoogleAuthUrl('/auth/popup-complete?provider=google')");
  });
});

describe('F3.13 — the fallback copy names a cause and a next step', () => {
  it('drops the bare "Sign in/up failed." strings', () => {
    for (const [name, src] of [['signin', signin], ['onboarding', onboarding]] as const) {
      expect(src, name).not.toContain("'Sign up failed.'");
      expect(src, name).not.toContain("'Sign in failed.'");
    }
  });
});
