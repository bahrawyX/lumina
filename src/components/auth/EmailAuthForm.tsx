'use client';

import React, { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  MIN_PASSWORD_LENGTH,
  getFieldError,
  nameSchema,
  emailSchema,
  passwordCreateSchema,
  passwordSchema,
} from '@/lib/validation';

export type AuthMode = 'signin' | 'signup';

/**
 * The one email sign-in / sign-up form.
 *
 * F2.1: there were two, maintained independently — `/auth/signin` and the
 * onboarding flow's `StepAuth` — each with its own tab strip, field component,
 * `inputCls`, `validate`, `handleSubmit`, and error rendering, duplicated
 * near-verbatim. They had **already drifted in three user-visible ways**:
 *
 *   1. `autoComplete` on the password field — onboarding was correct, the
 *      signin page hard-coded `new-password` in both modes (F3.5);
 *   2. the signin page cleared the guest flag on success, onboarding did not
 *      (F6.4);
 *   3. only onboarding offered "Continue as Guest".
 *
 * Every copy fix, validation change and error-handling improvement had to be
 * made twice — and the F3.7–F3.13 work (network errors, a real `<form>`,
 * `aria-describedby`, focus-to-first-error, stale-error clearing) had only been
 * applied to one of them. Extracting it is what makes those fixes true in both
 * places.
 *
 * The parts that genuinely differ between the two surfaces — the Google button,
 * the guest CTA, the "forgot password" link, the signed-in card — stay with
 * their callers and are passed as children.
 */
export interface EmailAuthFormProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;

  name: string;
  email: string;
  password: string;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;

  /** Non-null while a request is in flight; disables the whole form. */
  busy: string | null;
  /** Which `busy` values mean "this form's submit is running". */
  submitBusyValues?: readonly string[];

  /** Page-level failure. Rendered in destructive styling with `role="alert"`. */
  error: string | null;
  /** Page-level success. Rendered neutrally — F3.14. */
  notice?: string | null;

  onSubmit: (mode: AuthMode) => void;

  /** Rendered under the password field — the "Forgot your password?" link. */
  belowFields?: React.ReactNode;
  /** Rendered under the submit button — dividers, Google, guest CTA. */
  children?: React.ReactNode;
}

const AuthField: React.FC<{
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}> = ({ label, htmlFor, error, children }) => (
  <div className="flex flex-col gap-1">
    <label htmlFor={htmlFor} className="text-xs font-medium text-foreground/60 select-none">
      {label} <span className="text-destructive/50" aria-hidden="true">*</span>
    </label>
    {children}
    {/*
      Rendered conditionally rather than through `AnimatePresence`. Verified in
      a browser: as an exit-animated node the cleared error stayed in the DOM at
      `opacity: 0; height: 0` indefinitely, and with `role="alert"` on it that
      leaves stale error text in the accessibility tree after the user has
      already fixed the field. `AppShell` documents the same React 19 + Framer
      Motion failure for its hydration overlay.
    */}
    {error && (
      <p id={`${htmlFor}-error`} role="alert" className="text-xs text-destructive leading-tight">
        {error}
      </p>
    )}
  </div>
);

export function EmailAuthForm({
  mode,
  onModeChange,
  name,
  email,
  password,
  onNameChange,
  onEmailChange,
  onPasswordChange,
  busy,
  submitBusyValues = ['signin', 'signup'],
  error,
  notice,
  onSubmit,
  belowFields,
  children,
}: EmailAuthFormProps) {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // `setFieldErrors` is async, so `handleSubmit` cannot read the result of
  // `validate()` from state in the same tick.
  const fieldErrorsRef = useRef<Record<string, string>>({});

  const setErrors = (errors: Record<string, string>) => {
    setFieldErrors(errors);
    fieldErrorsRef.current = errors;
  };

  const clearErr = (field: string) => {
    const next = { ...fieldErrorsRef.current };
    delete next[field];
    setErrors(next);
  };

  /**
   * F3.12: the mode toggles used to clear only the page-level message. Field
   * errors survived, so failing sign-in validation and then switching to
   * "Create account" showed errors about rules that no longer applied —
   * including a password-length error against the sign-in schema, which has no
   * length rule at all.
   */
  const switchMode = (next: AuthMode) => {
    setErrors({});
    onModeChange(next);
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (mode === 'signup') {
      const e = getFieldError(nameSchema, name);
      if (e) errors.name = e;
    }
    const ee = getFieldError(emailSchema, email);
    if (ee) errors.email = ee;
    const pe = getFieldError(
      mode === 'signup' ? passwordCreateSchema : passwordSchema,
      password,
    );
    if (pe) errors.password = pe;
    setErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validate()) {
      // F3.9: a failed submit used to leave focus on the button, so a keyboard
      // or screen reader user had to hunt for what was wrong.
      const first = ['name', 'email', 'password'].find((f) => fieldErrorsRef.current[f]);
      if (first) document.getElementById(`auth-${first}`)?.focus();
      return;
    }
    onSubmit(mode);
  };

  const disabled = Boolean(busy);
  const submitting = busy !== null && submitBusyValues.includes(busy);

  const inputCls = (field: string) =>
    cn(
      'w-full px-3.5 py-2.5 rounded-lg bg-background border text-sm text-foreground',
      'outline-none focus-visible:ring-2 transition-colors duration-150 placeholder:text-muted-foreground/40',
      fieldErrors[field]
        ? 'border-destructive focus-visible:ring-destructive/20'
        : 'border-border/60 focus-visible:ring-primary/20 focus-visible:border-primary/50',
    );

  /**
   * F3.9: wires each input to its own error text and marks it invalid. Without
   * this the red border was the only signal — invisible to a screen reader, and
   * to anyone who cannot distinguish the colour.
   */
  const a11y = (field: string, id: string) => ({
    'aria-invalid': fieldErrors[field] ? (true as const) : undefined,
    'aria-describedby': fieldErrors[field] ? `${id}-error` : undefined,
    required: true,
  });

  return (
    <div className="space-y-5">
      <div className="flex p-0.5 rounded-lg border border-border/60 bg-muted/30" role="group" aria-label="Sign in or create an account">
        <button
          type="button"
          onClick={() => switchMode('signin')}
          disabled={disabled}
          aria-pressed={mode === 'signin'}
          className={cn(
            'flex-1 text-sm py-1.5 px-3 rounded-md font-medium transition-all duration-150',
            mode === 'signin'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => switchMode('signup')}
          disabled={disabled}
          aria-pressed={mode === 'signup'}
          className={cn(
            'flex-1 text-sm py-1.5 px-3 rounded-md font-medium transition-all duration-150',
            mode === 'signup'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Create account
        </button>
      </div>

      {/*
        F3.8: neither form had a `<form>` element. Enter did not submit, and —
        the part that matters more — password managers never offered to SAVE
        the credential, because they look for a form submission.
        `noValidate` because zod is the single source of truth (F3.11).
      */}
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="space-y-3.5">
          {mode === 'signup' && (
            <AuthField label="Full name" htmlFor="auth-name" error={fieldErrors.name}>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={(e) => { onNameChange(e.target.value); clearErr('name'); }}
                placeholder="Jane Smith"
                autoComplete="name"
                autoFocus
                disabled={disabled}
                {...a11y('name', 'auth-name')}
                className={inputCls('name')}
              />
            </AuthField>
          )}

          <AuthField label="Email address" htmlFor="auth-email" error={fieldErrors.email}>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => { onEmailChange(e.target.value); clearErr('email'); }}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus={mode === 'signin'}
              disabled={disabled}
              {...a11y('email', 'auth-email')}
              className={inputCls('email')}
            />
          </AuthField>

          <AuthField
            label={mode === 'signup' ? 'Create password' : 'Password'}
            htmlFor="auth-password"
            error={fieldErrors.password}
          >
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => { onPasswordChange(e.target.value); clearErr('password'); }}
              placeholder={mode === 'signup' ? `Min. ${MIN_PASSWORD_LENGTH} characters` : '••••••••'}
              /*
                F3.5: the signin page hard-coded `new-password` in BOTH modes,
                with a decoy `name` and `data-lpignore`, justified as stopping
                anyone on a shared device signing in without typing. That is not
                a security control — the saved credential is already gated by
                the OS or browser profile, and the session cookie makes the
                shared-device case moot. What it did was force every returning
                user to hand-type their password, which pushes people toward
                short, reused ones. Onboarding always did this correctly; that
                divergence is exactly what F2.1 is about.
              */
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              name={mode === 'signup' ? 'new-password' : 'current-password'}
              disabled={disabled}
              {...a11y('password', 'auth-password')}
              className={inputCls('password')}
            />
          </AuthField>
        </div>

        {belowFields}

        {/* F3.14: successes render neutrally; only failures are destructive. */}
        {notice && !error && (
          <p role="status" className="text-xs text-muted-foreground -mt-1">{notice}</p>
        )}
        {error && Object.keys(fieldErrors).length === 0 && (
          <p role="alert" className="text-xs text-destructive -mt-1">{error}</p>
        )}

        <button
          type="submit"
          disabled={disabled}
          className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {mode === 'signup'
            ? (submitting ? 'Creating account…' : 'Create account')
            : (submitting ? 'Signing in…' : 'Sign in')}
        </button>
      </form>

      {children}
    </div>
  );
}
