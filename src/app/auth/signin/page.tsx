'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLuminaAuthClient } from '@/components/AuthProvider';
import { GoogleProviderIcon } from '@/components/icons';
import { useGuestStore } from '@/store/useGuestStore';
import { resolveNextDestination } from '@/lib/auth/nextDestination';
import { oauthFailureMessage, useOAuthPopup } from '@/hooks/useOAuthPopup';
import { EmailAuthForm, type AuthMode } from '@/components/auth/EmailAuthForm';

/* ── Helpers ────────────────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   SIGN IN / SIGN UP PAGE
   ═══════════════════════════════════════════════════════════════ */
function SignInPageInner() {
  const router = useRouter();
  const authClient = useLuminaAuthClient();
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const openOAuthPopup = useOAuthPopup();

  // Where to go once authenticated. The route guard in `src/proxy.ts` sets
  // `?next=` when it bounces an unauthenticated request off an app route, and
  // any link into sign-in may carry one. `resolveNextDestination` accepts only
  // same-origin relative paths, so a crafted value cannot become an open
  // redirect; anything else falls back to /onboarding.
  const searchParams = useSearchParams();
  const destination = resolveNextDestination(searchParams.get('next'));

  /**
   * F2.2: the mode was local state with no `useSearchParams`, so
   * `/auth/signin?mode=signup` did nothing, nobody could be linked straight to
   * the sign-up form, and pressing Back after tapping "Create account" left the
   * app entirely instead of returning to Sign in.
   *
   * That is *why* marketing routes "Get started" to `/onboarding` — which is
   * why there were two forms at all (F2.1).
   */
  const authMode: AuthMode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin';

  const switchMode = useCallback(
    (next: AuthMode) => {
      setMessage(null);
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'signup') params.set('mode', 'signup');
      else params.delete('mode');
      // `push`, not `replace`. The audit's complaint is precisely that Back
      // after tapping "Create account" left the app entirely instead of
      // returning to Sign in — `replace` keeps that behaviour. The cost is that
      // toggling the tabs N times costs N Backs to leave the page, which is the
      // normal trade for putting a view state in the URL, and the reason it is
      // in the URL at all is so `?mode=signup` can be linked to (F2.3).
      router.push(`/auth/signin${params.toString() ? `?${params}` : ''}`, { scroll: false });
    },
    [router, searchParams],
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'signup' | 'signin' | 'google' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const clearMessage = () => setMessage(null);

  /* ── Auth handlers ─────────────────────────────────────── */
  const handleSignUp = useCallback(async () => {
    clearMessage();
    // No imperative re-validation here. `validate()` (zod, run by handleSubmit)
    // is the single source of truth. This block used to re-check with DIFFERENT
    // rules — `length < 2` for the name and `length < 6` for the password. The
    // password check was unreachable dead code because zod already enforced a
    // longer minimum; the name check was NOT, and produced a page-level error
    // that wasn't attached to the field it was about.
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    setBusy('signup');
    try {
      const result = await authClient.signUp.email({
        email: normalizedEmail,
        password,
        name: normalizedName,
        callbackURL: destination,
      });
      if (result.error) { setMessage(result.error.message ?? 'Sign up failed.'); return; }

      // `emailAndPassword.autoSignIn` is now `false` server-side. That is what
      // closes the sign-up enumeration oracle (F3.2): BetterAuth only returns
      // the generic synthetic-user response for an existing address when
      // auto-sign-in is off, and only that branch hashes the password, which is
      // what equalises the timing.
      //
      // The cost is that sign-up no longer establishes a session, so we do it
      // explicitly. If the address was already taken, the server returned the
      // generic success and THIS call fails with the same uniform 401 that any
      // wrong password produces — so the attacker still learns nothing, while a
      // genuine new user's flow is unchanged.
      const signedIn = await authClient.signIn.email({
        email: normalizedEmail,
        password,
        callbackURL: destination,
      });
      if (signedIn.error) {
        setMessage(
          'That email may already be registered. Try signing in instead, or use a different address.',
        );
        return;
      }

      useGuestStore.getState().clearGuestSession();
      // F3.15: `busy` is deliberately NOT cleared on success. The client
      // transition takes hundreds of milliseconds, during which the button was
      // enabled again with its label back to "Create account" — and a fast
      // second click fired a second `signUp.email`. It stays disabled until the
      // navigation replaces this page.
      router.replace(destination);
      return;
    } catch {
      // F3.7: there was no catch here. A dropped connection or a 500 threw out
      // of `authClient`, `finally` cleared the spinner, and the user was left
      // looking at an unchanged form with no error — indistinguishable from
      // "nothing happened", so they pressed the button again.
      setMessage("We couldn't reach Lumina. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }, [authClient, name, email, password, router, destination]);

  const handleSignIn = useCallback(async () => {
    clearMessage();
    // Same as above — `validate()` already ran zod over both fields.
    const normalizedEmail = email.trim().toLowerCase();

    setBusy('signin');
    try {
      const result = await authClient.signIn.email({
        email: normalizedEmail,
        password,
        callbackURL: destination,
      });
      if (result.error) { setMessage(result.error.message ?? 'Sign in failed.'); return; }
      useGuestStore.getState().clearGuestSession();
      // F3.15 — see handleSignUp.
      router.replace(destination);
      return;
    } catch {
      // F3.7 — see handleSignUp.
      setMessage("We couldn't reach Lumina. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }, [authClient, email, password, router, destination]);

  const handleGoogleSignIn = useCallback(async () => {
    clearMessage();
    setBusy('google');
    try {
      const result = await openOAuthPopup({
        provider: 'google',
        // Resolved AFTER the window opens, so the user gesture is not consumed
        // first — that ordering is why iOS Safari blocked this almost always.
        resolveUrl: async () => {
          const socialSignIn = (authClient.signIn as unknown as {
            social?: (args: Record<string, unknown>) => Promise<{
              error?: { message?: string };
              data?: { url?: string };
              url?: string;
            }>;
          })?.social;
          if (typeof socialSignIn !== 'function') {
            throw new Error('Google sign-in is unavailable right now.');
          }
          const started = await socialSignIn({
            provider: 'google',
            callbackURL: '/auth/popup-complete?provider=google',
            disableRedirect: true,
          });
          if (started?.error) {
            throw new Error(started.error.message ?? 'Google sign-in failed.');
          }
          const url = started?.data?.url ?? started?.url;
          if (!url || typeof url !== 'string') {
            throw new Error('Google sign-in is unavailable right now.');
          }
          return url;
        },
        // F4.2 / F4.3: a `postMessage` with `success !== false` was treated as
        // PROOF of authentication. If the callback set no cookie for any
        // reason, the user was bounced onward, saw the signed-out form again,
        // and had no idea why. The integration flow already refused to make
        // that assumption; this now matches — and the same probe rescues the
        // case where no message ever arrives.
        onPoll: async () => {
          const session = await authClient.getSession();
          return Boolean(session?.data?.user);
        },
      });

      if (result.kind === 'error') {
        if (result.reason === 'popup-blocked') {
          // Falling back to a full-page redirect is the only actionable
          // response on iOS, where "allow popups" is buried in Settings.
          setMessage(oauthFailureMessage(result, 'Google'));
          window.location.href = `/api/auth/sign-in/social?provider=google&callbackURL=${encodeURIComponent(destination)}`;
          return;
        }
        setMessage(oauthFailureMessage(result, 'Google'));
        return;
      }

      // Verified above by `onPoll`, but re-check: `ok` can also arrive from the
      // message alone.
      const session = await authClient.getSession();
      if (!session?.data?.user) {
        setMessage("Google signed you in, but we couldn't start your session. Please try again.");
        return;
      }

      useGuestStore.getState().clearGuestSession();
      // F3.15 — see handleSignUp.
      router.replace(destination);
      return;
    } catch {
      setMessage("We couldn't reach Lumina. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }, [openOAuthPopup, authClient, router, destination]);

  /* ── Already logged in ─────────────────────────────────── */
  // In an effect, not during render: calling router.replace() inline double-
  // fires under React 19 + reactStrictMode and warns about updating a component
  // while rendering another.
  const alreadySignedIn = !sessionLoading && Boolean(session?.user);
  useEffect(() => {
    if (alreadySignedIn) router.replace(destination);
  }, [alreadySignedIn, router, destination]);
  if (alreadySignedIn) return null;

  /* ── Render ────────────────────────────────────────────── */
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-[400px] space-y-8">
        {/* Logo — editorial */}
        <div className="text-center space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60">
            {authMode === 'signup' ? 'Begin' : 'Return'}
          </p>
          {/* F3.13: the page had NO `<h1>` — the largest text was a `<span>`
              wordmark, so a screen reader's heading list was empty and the
              page never stated its own task. The visible wordmark stays; the
              heading names what this screen is for. */}
          <h1 className="font-logo text-4xl font-medium tracking-[-0.03em] text-foreground select-none block leading-none">
            <span aria-hidden="true">Lumina</span>
            <span className="sr-only">
              {authMode === 'signup' ? 'Create your Lumina account' : 'Sign in to Lumina'}
            </span>
          </h1>
          <p className="text-[12px] text-muted-foreground/80 italic">
            {authMode === 'signup' ? 'A quiet place to get focused work done.' : 'Welcome back.'}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border/60 bg-card p-6 shadow-card space-y-5">
          {/*
            F2.1: the tab strip, fields, validation, error rendering and submit
            button that used to live here were a near-verbatim copy of
            `OnboardingFlow`'s `StepAuth`. They had already drifted — password
            autofill, the guest-flag reset, and which extras each offered — and
            every fix had to be made twice. One component now, consumed by both.
          */}
          <EmailAuthForm
            mode={authMode}
            onModeChange={switchMode}
            name={name}
            email={email}
            password={password}
            onNameChange={setName}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            busy={busy}
            error={message}
            onSubmit={(mode) => (mode === 'signup' ? handleSignUp() : handleSignIn())}
            belowFields={
              authMode === 'signin' ? (
                <p className="text-right">
                  <a
                    href="/auth/forgot-password"
                    className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    Forgot your password?
                  </a>
                </p>
              ) : null
            }
          >
          {/* Divider */}
          <div className="relative">
            <div className="h-px bg-border/50" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50 bg-card">
              or
            </span>
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={Boolean(busy)}
            className="w-full flex items-center justify-center gap-2.5 rounded-lg border border-border/70 bg-background px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/40 disabled:opacity-50 transition-colors"
          >
            {busy === 'google' ? 'Redirecting…' : (
              <>
                <GoogleProviderIcon size={16} />
                Continue with Google
              </>
            )}
          </button>
          </EmailAuthForm>
        </div>

        {/* Back link */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * `useSearchParams` requires a Suspense boundary on a statically prerendered
 * route; without one the whole page opts into dynamic rendering.
 */
export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] flex items-center justify-center bg-background">
          <span className="font-logo text-2xl font-medium tracking-[-0.035em] text-foreground/20">
            Lumina
          </span>
        </div>
      }
    >
      <SignInPageInner />
    </Suspense>
  );
}
