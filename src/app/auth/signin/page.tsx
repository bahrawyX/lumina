'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useLuminaAuthClient } from '@/components/AuthProvider';
import { GoogleProviderIcon } from '@/components/icons';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { useGuestStore } from '@/store/useGuestStore';
import { useTutorialStore } from '@/store/useTutorialStore';
import { cn } from '@/lib/utils';
import {
  getFieldError,
  nameSchema,
  emailSchema,
  passwordCreateSchema,
  passwordSchema,
} from '@/lib/validation';

/* ── Constants ──────────────────────────────────────────────── */
type AuthMode = 'signin' | 'signup';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    <AnimatePresence>
      {error && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.14 }}
          className="text-xs text-destructive overflow-hidden leading-tight"
        >
          {error}
        </motion.p>
      )}
    </AnimatePresence>
  </div>
);

/* ── OAuth popup helper ─────────────────────────────────────── */
function useOAuthPopup(authClient: ReturnType<typeof useLuminaAuthClient>) {
  return useCallback(async (provider: 'google' | 'microsoft'): Promise<boolean> => {
    const socialSignIn = (authClient.signIn as any)?.social;
    if (typeof socialSignIn !== 'function') {
      throw new Error(`${provider === 'google' ? 'Google' : 'Microsoft'} sign-in is unavailable.`);
    }

    const result = await socialSignIn({
      provider,
      callbackURL: `/auth/popup-complete?provider=${provider}`,
      disableRedirect: true,
    });

    if (result?.error) {
      throw new Error(result.error.message ?? `${provider} sign-in failed.`);
    }

    const popupUrl = result?.data?.url ?? result?.url;
    if (!popupUrl || typeof popupUrl !== 'string') {
      throw new Error('Could not start OAuth sign-in.');
    }

    const width = 520;
    const height = 700;
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);

    const popup = window.open(
      popupUrl,
      `lumina-oauth-${provider}`,
      `popup=yes,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)},resizable=yes,scrollbars=yes`,
    );

    if (!popup) {
      throw new Error('Popup blocked. Please allow popups and try again.');
    }

    popup.focus();

    return await new Promise<boolean>((resolve) => {
      let settled = false;

      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        window.clearInterval(pollId);
        window.clearTimeout(timeoutId);
      };

      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if ((data as { type?: string }).type !== 'lumina:oauth-complete') return;
        if ((data as { provider?: string }).provider !== provider) return;
        if ((data as { success?: boolean }).success === false) {
          settled = true;
          cleanup();
          resolve(false);
          return;
        }
        settled = true;
        cleanup();
        resolve(true);
      };

      const pollId = window.setInterval(() => {
        if (!settled && popup.closed) {
          settled = true;
          cleanup();
          resolve(false);
        }
      }, 350);

      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        try { popup.close(); } catch { /* noop */ }
        resolve(false);
      }, 3 * 60 * 1000);

      window.addEventListener('message', onMessage);
    });
  }, [authClient]);
}

/* ── Post-auth actions ──────────────────────────────────────── */
function finalizeAuth() {
  // Mark onboarding complete so AppShell doesn't redirect to /onboarding
  useOnboardingStore.getState().complete();
  // Clear guest mode
  useGuestStore.getState().setGuest(false);
  // Reset tutorial so "New to Lumina? Explore" prompt reappears
  useTutorialStore.setState({ hasSeenPrompt: false, hasCompletedTutorial: false });
}

/* ═══════════════════════════════════════════════════════════════
   SIGN IN / SIGN UP PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function SignInPage() {
  const router = useRouter();
  const authClient = useLuminaAuthClient();
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const startOAuth = useOAuthPopup(authClient);

  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'signup' | 'signin' | 'google' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearErr = (field: string) =>
    setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });

  const clearMessage = () => setMessage(null);

  const inputCls = (field: string) =>
    cn(
      'w-full px-3.5 py-2.5 rounded-lg bg-background border text-sm text-foreground',
      'outline-none focus-visible:ring-2 transition-colors duration-150 placeholder:text-muted-foreground/40',
      fieldErrors[field]
        ? 'border-destructive focus-visible:ring-destructive/20'
        : 'border-border/60 focus-visible:ring-primary/20 focus-visible:border-primary/50',
    );

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
    return Object.keys(errors).length === 0;
  };

  /* ── Auth handlers ─────────────────────────────────────── */
  const handleSignUp = useCallback(async () => {
    clearMessage();
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedName.length < 2) { setMessage('Please enter your full name.'); return; }
    if (!EMAIL_REGEX.test(normalizedEmail)) { setMessage('Please enter a valid email.'); return; }
    if (password.length < 6) { setMessage('Password must be at least 6 characters.'); return; }

    setBusy('signup');
    try {
      const result = await authClient.signUp.email({
        email: normalizedEmail,
        password,
        name: normalizedName,
        callbackURL: '/',
      });
      if (result.error) { setMessage(result.error.message ?? 'Sign up failed.'); return; }
      finalizeAuth();
      router.replace('/');
    } finally {
      setBusy(null);
    }
  }, [authClient, name, email, password, router]);

  const handleSignIn = useCallback(async () => {
    clearMessage();
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) { setMessage('Please enter a valid email.'); return; }
    if (!password) { setMessage('Please enter your password.'); return; }

    setBusy('signin');
    try {
      const result = await authClient.signIn.email({
        email: normalizedEmail,
        password,
        callbackURL: '/',
      });
      if (result.error) { setMessage(result.error.message ?? 'Sign in failed.'); return; }
      finalizeAuth();
      router.replace('/');
    } finally {
      setBusy(null);
    }
  }, [authClient, email, password, router]);

  const handleGoogleSignIn = useCallback(async () => {
    clearMessage();
    setBusy('google');
    try {
      const completed = await startOAuth('google');
      if (!completed) { setMessage('Google sign-in was cancelled.'); return; }
      finalizeAuth();
      router.replace('/');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setBusy(null);
    }
  }, [startOAuth, router]);

  const handleSubmit = () => {
    if (!validate()) return;
    if (authMode === 'signup') handleSignUp();
    else handleSignIn();
  };

  /* ── Already logged in ─────────────────────────────────── */
  if (!sessionLoading && session?.user) {
    finalizeAuth();
    router.replace('/');
    return null;
  }

  /* ── Render ────────────────────────────────────────────── */
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-[400px] space-y-8">
        {/* Logo */}
        <div className="text-center space-y-2">
          <span className="font-logo text-3xl font-semibold tracking-tight text-primary select-none">
            Lumina
          </span>
          <p className="text-sm text-muted-foreground">
            {authMode === 'signup' ? 'Create your account' : 'Welcome back'}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm space-y-5">
          {/* Tab strip */}
          <div className="flex p-0.5 rounded-lg border border-border/60 bg-muted/30">
            <button
              type="button"
              onClick={() => { setAuthMode('signin'); clearMessage(); }}
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
              onClick={() => { setAuthMode('signup'); clearMessage(); }}
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
                disabled={Boolean(busy)}
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
                placeholder={authMode === 'signup' ? 'Min. 8 characters' : '••••••••'}
                autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                disabled={Boolean(busy)}
                className={inputCls('password')}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              />
            </AuthField>
          </div>

          {/* Error */}
          {message && Object.keys(fieldErrors).length === 0 && (
            <p className="text-xs text-destructive -mt-1">{message}</p>
          )}

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={Boolean(busy)}
            className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {authMode === 'signup'
              ? (busy === 'signup' ? 'Creating account…' : 'Create account')
              : (busy === 'signin' ? 'Signing in…' : 'Sign in')}
          </button>

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
