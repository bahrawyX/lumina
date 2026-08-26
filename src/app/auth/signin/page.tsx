'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useLuminaAuthClient } from '@/components/AuthProvider';
import { GoogleProviderIcon } from '@/components/icons';
import { useGuestStore } from '@/store/useGuestStore';
import { cn } from '@/lib/utils';
import { resolveNextDestination } from '@/lib/auth/nextDestination';
import { oauthFailureMessage, useOAuthPopup } from '@/hooks/useOAuthPopup';
import {
  MIN_PASSWORD_LENGTH,
  getFieldError,
  nameSchema,
  emailSchema,
  passwordCreateSchema,
  passwordSchema,
} from '@/lib/validation';

/* ── Constants ──────────────────────────────────────────────── */
type AuthMode = 'signin' | 'signup';

/* ── Helpers ────────────────────────────────────────────────── */
const AuthField: React.FC<{
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}> = ({ label, htmlFor, error, children }) => (
  <div className="flex flex-col gap-1">
    <label htmlFor={htmlFor} className="text-xs font-medium text-foreground/60 select-none">
      {label}{' '}
      <span className="text-destructive/50" aria-hidden="true">*</span>
    </label>
    {children}
    {/* F3.9: the errors were animated text with no programmatic relationship
        to their input, so a screen reader user submitting the form was told
        nothing at all. The id is what `aria-describedby` on the input points
        at, and `role="alert"` is what makes a newly appearing message announce
        itself.

        FOUND WHILE FIXING THAT: this was an `AnimatePresence` + `motion.p`, and
        the exit phase never finalises — verified in a browser, the cleared
        error sat in the DOM at `opacity: 0; height: 0` indefinitely rather than
        unmounting. Invisible, so it went unnoticed; but with `role="alert"` on
        it, stale error text would have stayed in the accessibility tree after
        the user had fixed the field. `AppShell` documents the same React 19 +
        Framer Motion failure for its hydration overlay and reaches the same
        conclusion: a plain conditional render removes the node in one frame,
        and a 140ms tween on an error message is not worth that class of bug. */}
    {error && (
      <p
        id={htmlFor ? `${htmlFor}-error` : undefined}
        role="alert"
        className="text-xs text-destructive overflow-hidden leading-tight"
      >
        {error}
      </p>
    )}
  </div>
);

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

  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'signup' | 'signin' | 'google' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearErr = (field: string) =>
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      fieldErrorsRef.current = next;
      return next;
    });

  const clearMessage = () => setMessage(null);

  /**
   * F3.12: the mode toggles cleared only the page-level message. Field errors
   * survived, so failing sign-in validation and then switching to "Create
   * account" showed errors about rules that no longer applied — including a
   * password-length error against the sign-in schema, which has none.
   */
  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setMessage(null);
    setFieldErrors({});
    fieldErrorsRef.current = {};
  };

  /**
   * F3.9: wires each input to its own error text and marks it invalid.
   * Without this the red border was the ONLY signal, which is invisible to a
   * screen reader and to anyone who cannot distinguish the colour.
   */
  const a11yProps = (field: string, id: string) => ({
    'aria-invalid': fieldErrors[field] ? (true as const) : undefined,
    'aria-describedby': fieldErrors[field] ? `${id}-error` : undefined,
    required: true,
  });

  const inputCls = (field: string) =>
    cn(
      'w-full px-3.5 py-2.5 rounded-lg bg-background border text-sm text-foreground',
      'outline-none focus-visible:ring-2 transition-colors duration-150 placeholder:text-muted-foreground/40',
      fieldErrors[field]
        ? 'border-destructive focus-visible:ring-destructive/20'
        : 'border-border/60 focus-visible:ring-primary/20 focus-visible:border-primary/50',
    );

  // `setFieldErrors` is async, so `handleSubmit` cannot read the result of
  // `validate()` from state in the same tick. The ref mirrors it.
  const fieldErrorsRef = React.useRef<Record<string, string>>({});

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (authMode === 'signup') {
      const e = getFieldError(nameSchema, name);
      if (e) errors.name = e;
    }
    const ee = getFieldError(emailSchema, email);
    if (ee) errors.email = ee;
    const pe = getFieldError(
      authMode === 'signup' ? passwordCreateSchema : passwordSchema,
      password,
    );
    if (pe) errors.password = pe;
    setFieldErrors(errors);
    fieldErrorsRef.current = errors;
    return Object.keys(errors).length === 0;
  };

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
      router.replace(destination);
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
      router.replace(destination);
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
      router.replace(destination);
    } catch {
      setMessage("We couldn't reach Lumina. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }, [openOAuthPopup, authClient, router, destination]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validate()) {
      // F3.9: a failed submit left focus on the button, so a keyboard or screen
      // reader user had to hunt for what was wrong. Move to the first field
      // that failed, in DOM order.
      const first = ['name', 'email', 'password'].find((f) => fieldErrorsRef.current[f]);
      if (first) document.getElementById(`auth-${first}`)?.focus();
      return;
    }
    if (authMode === 'signup') handleSignUp();
    else handleSignIn();
  };

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
          {/* Tab strip */}
          <div className="flex p-0.5 rounded-lg border border-border/60 bg-muted/30">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              disabled={Boolean(busy)}
              className={cn(
                'flex-1 text-sm py-1.5 px-3 rounded-md font-medium transition-all duration-150',
                authMode === 'signin'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              disabled={Boolean(busy)}
              className={cn(
                'flex-1 text-sm py-1.5 px-3 rounded-md font-medium transition-all duration-150',
                authMode === 'signup'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Create account
            </button>
          </div>

          {/* F3.8: there was no `<form>` element. Enter did not submit (an
              ad-hoc `onKeyDown` was doing it by hand), and password managers
              never offered to SAVE the credential — they look for a form
              submission, so a user could autofill on the next visit only if
              they had saved it some other way. */}
          <form onSubmit={handleSubmit} noValidate>
          {/* Fields */}
          <div className="space-y-3.5">
            <AnimatePresence initial={false}>
              {authMode === 'signup' && (
                <motion.div
                  key="name-field"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <AuthField label="Full name" htmlFor="auth-name" error={fieldErrors.name}>
                    <input
                      id="auth-name"
                      type="text"
                      value={name}
                      onChange={(e) => { setName(e.target.value); clearErr('name'); }}
                      placeholder="Jane Smith"
                      autoComplete="name"
                      autoFocus={authMode === 'signup'}
                      disabled={Boolean(busy)}
                      {...a11yProps('name', 'auth-name')}
                      className={inputCls('name')}
                    />
                  </AuthField>
                </motion.div>
              )}
            </AnimatePresence>

            <AuthField label="Email address" htmlFor="auth-email" error={fieldErrors.email}>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearErr('email'); }}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus={authMode === 'signin'}
                disabled={Boolean(busy)}
                {...a11yProps('email', 'auth-email')}
                className={inputCls('email')}
              />
            </AuthField>

            <AuthField
              label={authMode === 'signup' ? 'Create password' : 'Password'}
              htmlFor="auth-password"
              error={fieldErrors.password}
            >
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearErr('password'); }}
                placeholder={authMode === 'signup' ? `Min. ${MIN_PASSWORD_LENGTH} characters` : '••••••••'}
                // F3.5 — this was hard-coded to "new-password" in BOTH modes,
                // with a decoy `name`, `data-lpignore` and `data-1p-ignore`,
                // justified as stopping anyone on a shared device signing in
                // without typing.
                //
                // That is not a security control. The saved credential is
                // already gated by the OS or browser profile, and the session
                // cookie makes the shared-device scenario moot anyway. What it
                // actually did was force every returning user to hand-type
                // their password — which pushes people toward short, memorable,
                // reused passwords, the exact opposite of the stated goal — and
                // block 1Password and LastPass users outright.
                //
                // It also contradicted this app's OTHER form: OnboardingFlow
                // already did the correct thing, so the same user got different
                // autofill behaviour on two screens of the same product.
                autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                name={authMode === 'signup' ? 'new-password' : 'current-password'}
                disabled={Boolean(busy)}
                {...a11yProps('password', 'auth-password')}
                className={inputCls('password')}
              />
            </AuthField>
          </div>

          {authMode === 'signin' && (
            <p className="text-right">
              <a
                href="/auth/forgot-password"
                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Forgot your password?
              </a>
            </p>
          )}

          {/* Error */}
          {message && Object.keys(fieldErrors).length === 0 && (
            // F3.9: this was a silent `<p>`. `role="alert"` is what makes a
            // newly rendered message announce itself without stealing focus.
            <p role="alert" className="text-xs text-destructive -mt-1">{message}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={Boolean(busy)}
            className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {authMode === 'signup'
              ? (busy === 'signup' ? 'Creating account…' : 'Create account')
              : (busy === 'signin' ? 'Signing in…' : 'Sign in')}
          </button>
          </form>

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
