'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLuminaAuthClient } from '@/components/AuthProvider';
import {
  MIN_PASSWORD_LENGTH,
  getFieldError,
  passwordCreateSchema,
} from '@/lib/validation';
import { cn } from '@/lib/utils';

/**
 * F3.6 — choose a new password from a reset link.
 *
 * The token arrives as `?token=`; BetterAuth verifies and consumes it. With
 * `revokeSessionsOnPasswordReset: true` in the auth config, completing this
 * also kills every other session — which is the entire point when the reason
 * for resetting is "someone else has my password". That default is `false`,
 * so it had to be set explicitly.
 */
function ResetPasswordInner() {
  const authClient = useLuminaAuthClient();
  const router = useRouter();
  const token = useSearchParams().get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-medium tracking-[-0.03em]">
          This link isn&rsquo;t valid
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Reset links expire and can only be used once. Request a new one to continue.
        </p>
        <Link
          href="/auth/forgot-password"
          className="inline-block text-sm font-medium underline underline-offset-4"
        >
          Request a new link
        </Link>
      </Shell>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const errors: Record<string, string> = {};
    const passwordError = getFieldError(passwordCreateSchema, password);
    if (passwordError) errors.password = passwordError;
    if (password !== confirm) errors.confirm = 'Passwords do not match';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        // The breach check (haveIBeenPwned) also runs on this path, so a
        // rejection here may be "that password has appeared in a breach"
        // rather than a bad token. Show what the server said.
        setError(result.error.message ?? 'That link has expired. Request a new one.');
        return;
      }
      router.replace('/auth/signin?reset=1');
    } catch {
      setError("We couldn't reach Lumina. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <form onSubmit={submit} className="w-full space-y-6 text-left">
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-medium tracking-[-0.03em]">
            Choose a new password
          </h1>
          <p className="text-sm text-muted-foreground">
            You&rsquo;ll be signed out everywhere else once this is saved.
          </p>
        </div>

        <Field
          id="new-password"
          label="New password"
          error={fieldErrors.password}
          value={password}
          onChange={(v) => {
            setPassword(v);
            setFieldErrors((p) => ({ ...p, password: '' }));
          }}
          autoComplete="new-password"
          placeholder={`Min. ${MIN_PASSWORD_LENGTH} characters`}
          autoFocus
        />

        <Field
          id="confirm-password"
          label="Confirm password"
          error={fieldErrors.confirm}
          value={confirm}
          onChange={(v) => {
            setConfirm(v);
            setFieldErrors((p) => ({ ...p, confirm: '' }));
          }}
          autoComplete="new-password"
          placeholder="Repeat it"
        />

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-[400px] space-y-6 text-center">{children}</div>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  value,
  onChange,
  autoComplete,
  placeholder,
  autoFocus,
}: {
  id: string;
  label: string;
  error?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-foreground/60">
        {label} <span className="text-destructive/60">*</span>
      </label>
      <input
        id={id}
        type="password"
        required
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        placeholder={placeholder}
        className={cn(
          'w-full px-3.5 py-2.5 rounded-lg bg-background border text-sm text-foreground',
          'outline-none transition-colors duration-150 placeholder:text-muted-foreground/40',
          error ? 'border-destructive' : 'border-border/60',
        )}
      />
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive leading-tight">
          {error}
        </p>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Shell><span className="text-sm text-muted-foreground">Loading…</span></Shell>}>
      <ResetPasswordInner />
    </Suspense>
  );
}
