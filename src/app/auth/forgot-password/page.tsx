'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLuminaAuthClient } from '@/components/AuthProvider';
import { emailSchema, getFieldError } from '@/lib/validation';
import { cn } from '@/lib/utils';

/**
 * F3.6 — there was no password reset flow at all.
 *
 * `/request-password-reset` threw `400 RESET_PASSWORD_DISABLED` before doing
 * anything, because `emailAndPassword.sendResetPassword` was unset. A user who
 * forgot their password, or suspected it had been compromised, had no recovery
 * and no rotation path — and given F3.4, a Google-first user had no way to
 * *create* a password either.
 *
 * The response is deliberately identical whether or not the address exists.
 * Sign-in is already uniform (F3.2 was only about sign-*up*), and it would be
 * pointless to close that oracle while opening a new one here.
 */
export default function ForgotPasswordPage() {
  const authClient = useLuminaAuthClient();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const invalid = getFieldError(emailSchema, email);
    if (invalid) {
      setFieldError(invalid);
      return;
    }
    setFieldError(null);
    setBusy(true);

    try {
      await authClient.requestPasswordReset({
        email: email.trim().toLowerCase(),
        redirectTo: '/auth/reset-password',
      });
      // Success regardless of the result: revealing "no such account" here would
      // hand back the enumeration oracle closed elsewhere.
      setSent(true);
    } catch {
      // F3.7 — the auth handlers had no `catch` at all, so a rejected request
      // (offline, DNS, a proxy abort) surfaced only as an unhandled rejection
      // in the console while the button quietly re-enabled.
      setError("We couldn't reach Lumina. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-12 bg-background">
        <div className="w-full max-w-[400px] space-y-6 text-center">
          <h1 className="font-display text-2xl font-medium tracking-[-0.03em]">Check your email</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            If an account exists for <span className="text-foreground">{email.trim()}</span>,
            we&rsquo;ve sent a link to choose a new password. It expires shortly and can be used
            once.
          </p>
          <Link
            href="/auth/signin"
            className="inline-block text-sm font-medium underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-12 bg-background">
      <form onSubmit={submit} className="w-full max-w-[400px] space-y-6">
        <div className="space-y-2">
          {/* F3.13 — the sign-in page had no <h1> at all; the largest text was a
              <span> reading "Lumina". A heading should state the task. */}
          <h1 className="font-display text-2xl font-medium tracking-[-0.03em]">
            Reset your password
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter the email address on your account and we&rsquo;ll send you a link.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="reset-email" className="text-xs font-medium text-foreground/60">
            Email <span className="text-destructive/60">*</span>
          </label>
          <input
            id="reset-email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldError(null);
              setError(null);
            }}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError ? 'reset-email-error' : undefined}
            className={cn(
              'w-full px-3.5 py-2.5 rounded-lg bg-background border text-sm text-foreground',
              'outline-none transition-colors duration-150 placeholder:text-muted-foreground/40',
              fieldError ? 'border-destructive' : 'border-border/60',
            )}
            placeholder="you@example.com"
          />
          {fieldError && (
            <p id="reset-email-error" className="text-xs text-destructive leading-tight">
              {fieldError}
            </p>
          )}
        </div>

        {error && (
          // F3.9 — page-level errors were plain <p> with no role, so a screen
          // reader user submitted the form and heard nothing.
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send reset link'}
        </button>

        <p className="text-center text-sm">
          <Link href="/auth/signin" className="underline underline-offset-4 text-muted-foreground">
            Back to sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
