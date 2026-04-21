'use client';

import React, { useState, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore, FocusPreference, FocusSessionLength, FocusGoal } from '../store/useOnboardingStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { usePomodoroStore } from '../store/usePomodoroStore';
import { useCalendarStore } from '../store/useCalendarStore';
import { usePlannerStore } from '../store/usePlannerStore';
import { focusSessionSelectionToMinutes } from '../lib/focusSettings';
import { cn } from '../lib/utils';
import { LottieAnimation, ONBOARDING_COMPLETE_LAYER_MAP } from './ui/LottieAnimation';
import TimePicker from './TimePicker';
import { useLuminaAuthClient } from './AuthProvider';
import { GoogleProviderIcon, OutlookProviderIcon } from './icons';
import { useGuestStore } from '../store/useGuestStore';
import {
  getFieldError,
  nameSchema,
  emailSchema,
  passwordCreateSchema,
  passwordSchema,
} from '../lib/validation';

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const TOTAL_STEPS = 7; // 0..6
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SLIDE_VARIANTS = {
  enter: (dir: number) => ({
    x: dir > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({
    x: dir > 0 ? -40 : 40,
    opacity: 0,
  }),
};

const TRANSITION = {
  duration: 0.35,
  ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
};

type IntegrationProvider = 'google' | 'microsoft';
type IntegrationPopupFailureReason =
  | 'closed'
  | 'timeout'
  | 'message-error'
  | 'popup-blocked'
  | 'status-false';
type IntegrationPopupResult =
  | { ok: true }
  | { ok: false; reason: IntegrationPopupFailureReason; error?: string | null };
type AuthMode = 'signin' | 'signup';

function getIntegrationLabel(provider: IntegrationProvider): string {
  return provider === 'google' ? 'Google Calendar' : 'Outlook';
}

function isGoogleBlockedContextError(error?: string | null): boolean {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return (
    normalized.includes('access_denied')
    || normalized.includes('oauth_error')
    || normalized.includes('browser')
    || normalized.includes('secure')
  );
}

function getIntegrationFailureMessage(
  provider: IntegrationProvider,
  result: IntegrationPopupResult,
): string {
  if (result.ok) {
    return `${getIntegrationLabel(provider)} connection was not completed. Try again in a regular browser window.`;
  }

  const failedResult = result as Extract<IntegrationPopupResult, { ok: false }>;

  if (
    provider === 'google' && (
      failedResult.reason === 'timeout'
      || failedResult.reason === 'status-false'
      || (
        failedResult.reason === 'message-error'
        && isGoogleBlockedContextError(failedResult.error)
      )
    )
  ) {
    return 'Google blocked browser/app context. OAuth failed. Connection was not completed. Try again in a regular browser window.';
  }

  if (failedResult.reason === 'popup-blocked') {
    return 'Popup blocked. Connection was not completed. Try again in a regular browser window.';
  }

  if (failedResult.reason === 'closed') {
    return `${getIntegrationLabel(provider)} popup was closed before completion. Connection was not completed.`;
  }

  if (failedResult.reason === 'timeout') {
    return `${getIntegrationLabel(provider)} popup timed out. OAuth failed. Connection was not completed. Try again in a regular browser window.`;
  }

  if (failedResult.reason === 'status-false') {
    return `${getIntegrationLabel(provider)} OAuth finished but status stayed disconnected. Connection was not completed. Try again in a regular browser window.`;
  }

  return `${getIntegrationLabel(provider)} OAuth failed. Connection was not completed. Try again in a regular browser window.`;
}

/* ─── Reusable primitives ────────────────────────────────────────────────────── */

const OptionButton = memo<{
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}>(({ selected, onClick, children, className }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'relative flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border transition-all duration-150 text-left cursor-pointer w-full',
      selected
        ? 'border-primary/40 bg-primary/[0.08] dark:bg-primary/[0.07] text-foreground'
        : 'border-border/70 bg-background text-foreground hover:bg-muted/50 dark:hover:bg-muted/30 hover:border-border',
      className
    )}
  >
    {/* Single selection signal: background tint is enough — no redundant filled circle */}
    <span
      className={cn(
        'flex-shrink-0 w-3.5 h-3.5 rounded-full border-[1.5px] transition-all duration-150',
        selected ? 'border-primary bg-primary' : 'border-border/60'
      )}
    />
    {children}
  </button>
));
OptionButton.displayName = 'OptionButton';

/* ─── Progress Dots ─────────────────────────────────────────────────────────── */
const ProgressDots = memo<{ step: number; total: number }>(({ step, total }) => (
  <div className="flex items-center gap-1.5">
    {Array.from({ length: total }).map((_, i) => (
      <motion.div
        key={i}
        animate={{
          width: i === step ? 24 : 6,
          opacity: i < step ? 0.6 : i === step ? 1 : 0.2,
        }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          'h-1 rounded-full',
          i <= step ? 'bg-primary' : 'bg-border'
        )}
      />
    ))}
  </div>
));
ProgressDots.displayName = 'ProgressDots';

/* ─── Step containers ────────────────────────────────────────────────────────── */

const StepShell = memo<{
  title: string;
  description: string;
  children: React.ReactNode;
}>(({ title, description, children }) => (
  <div className="space-y-6">
    <div className="space-y-2">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
    <div className="space-y-2">{children}</div>
  </div>
));
StepShell.displayName = 'StepShell';

/* ═══════════════════════════════════════════════════════════════════════════════
   STEP 0 — Welcome
══════════════════════════════════════════════════════════════════════════════ */
const StepWelcome = memo(() => (
  <div className="space-y-6">
    <div className="space-y-4">
      <span className="font-logo text-4xl font-semibold tracking-tight text-primary select-none">
        Lumina
      </span>
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Welcome.
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
          Let's build your personal focus environment.
          This takes less than a minute.
        </p>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-2">
      {[
        { text: 'Set your schedule and preferences' },
        { text: 'Pick a focus rhythm that fits you' },
        { text: 'Optionally sync your calendar' },
      ].map(({ text }) => (
        <div key={text} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/40 border border-border/60">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/50 flex-shrink-0" />
          <span className="text-sm text-muted-foreground">{text}</span>
        </div>
      ))}
    </div>
  </div>
));
StepWelcome.displayName = 'StepWelcome';

/* ═══════════════════════════════════════════════════════════════════════════════
   STEP 1 — Account
══════════════════════════════════════════════════════════════════════════════ */

/** Label-above-field wrapper with inline error message. */
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

const StepAuth = memo<{
  authStatus: 'loading' | 'logged out' | 'logged in';
  authUserEmail: string | null;
  authUserName: string | null;
  authUserImage: string | null;
  authMode: AuthMode;
  authName: string;
  authEmail: string;
  authPassword: string;
  authBusy: 'signup' | 'signin' | 'google' | 'signout' | 'microsoft' | null;
  authMessage: string | null;
  onAuthNameChange: (value: string) => void;
  onAuthEmailChange: (value: string) => void;
  onAuthPasswordChange: (value: string) => void;
  onSignUp: () => void;
  onSignIn: () => void;
  onGoogleSignIn: () => void;
  onSignOut: () => void;
  onSwitchToSignUp: () => void;
  onSwitchToSignIn: () => void;
  onContinueAsGuest: () => void;
}>(({
  authStatus,
  authUserEmail,
  authUserName,
  authUserImage,
  authMode,
  authName,
  authEmail,
  authPassword,
  authBusy,
  authMessage,
  onAuthNameChange,
  onAuthEmailChange,
  onAuthPasswordChange,
  onSignUp,
  onSignIn,
  onGoogleSignIn,
  onSignOut,
  onSwitchToSignUp,
  onSwitchToSignIn,
  onContinueAsGuest,
}) => {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [guestExpanded, setGuestExpanded] = useState(false);

  const clearErr = (field: string) =>
    setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (authMode === 'signup') {
      const e = getFieldError(nameSchema, authName);
      if (e) errors.name = e;
    }
    const ee = getFieldError(emailSchema, authEmail);
    if (ee) errors.email = ee;
    const pe = getFieldError(
      authMode === 'signup' ? passwordCreateSchema : passwordSchema,
      authPassword,
    );
    if (pe) errors.password = pe;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    if (authMode === 'signup') onSignUp();
    else onSignIn();
  };

  const inputCls = (field: string) =>
    cn(
      'w-full px-3.5 py-2.5 rounded-lg bg-background border text-sm text-foreground',
      'outline-none focus-visible:ring-2 transition-colors duration-150 placeholder:text-muted-foreground/40',
      fieldErrors[field]
        ? 'border-destructive focus-visible:ring-destructive/20'
        : 'border-border/60 focus-visible:ring-primary/20 focus-visible:border-primary/50',
    );

  /* ── Logged-in state ─────────────────────────────────────────────── */
  if (authStatus === 'logged in') {
    const initials = authUserName
      ? authUserName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
      : (authUserEmail?.[0] ?? '?').toUpperCase();

    return (
      <StepShell
        title="Secure your workspace"
        description="Your account is connected. Continue to finish setup."
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-primary/20 bg-primary/[0.04] px-4 py-3.5 flex items-center gap-3">
            {authUserImage ? (
              <img
                src={authUserImage}
                alt={authUserName ?? authUserEmail ?? 'User'}
                className="w-9 h-9 rounded-full object-cover flex-shrink-0 ring-2 ring-primary/20"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 ring-2 ring-primary/20">
                <span className="text-xs font-semibold text-primary">{initials}</span>
              </div>
            )}
            <div className="min-w-0">
              {authUserName && (
                <p className="text-sm font-semibold text-foreground truncate leading-snug">{authUserName}</p>
              )}
              <p className="text-xs text-muted-foreground truncate leading-snug">{authUserEmail ?? ''}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            disabled={Boolean(authBusy)}
            className="w-full rounded-lg border border-border/60 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-50 transition-colors"
          >
            {authBusy === 'signout' ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </StepShell>
    );
  }

  /* ── Sign-in / Create account state ──────────────────────────────── */
  return (
    <StepShell
      title="Secure your workspace"
      description="Sign in once and your settings follow you across sessions and devices."
    >
      <div className="space-y-5">
        {/* Mode tab strip */}
        <div className="flex p-0.5 rounded-lg border border-border/60 bg-muted/30">
          <button
            type="button"
            onClick={onSwitchToSignIn}
            disabled={Boolean(authBusy)}
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
            onClick={onSwitchToSignUp}
            disabled={Boolean(authBusy)}
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
                    name="onboarding-auth-name"
                    value={authName}
                    onChange={(e) => { onAuthNameChange(e.target.value); clearErr('name'); }}
                    placeholder="Jane Smith"
                    autoComplete="name"
                    autoFocus={authMode === 'signup'}
                    disabled={Boolean(authBusy)}
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
              name="onboarding-auth-email"
              value={authEmail}
              onChange={(e) => { onAuthEmailChange(e.target.value); clearErr('email'); }}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={Boolean(authBusy)}
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
              name="onboarding-auth-password"
              value={authPassword}
              onChange={(e) => { onAuthPasswordChange(e.target.value); clearErr('password'); }}
              placeholder={authMode === 'signup' ? 'Min. 8 characters' : '••••••••'}
              autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
              disabled={Boolean(authBusy)}
              className={inputCls('password')}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            />
          </AuthField>
        </div>

        {/* Server-level error (only shown when there are no field-level errors) */}
        {authMessage && Object.keys(fieldErrors).length === 0 && (
          <p className="text-xs text-destructive -mt-1">{authMessage}</p>
        )}

        {/* Primary submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={Boolean(authBusy)}
          className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {authMode === 'signup'
            ? (authBusy === 'signup' ? 'Creating account…' : 'Create account')
            : (authBusy === 'signin' ? 'Signing in…' : 'Sign in')}
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
          onClick={onGoogleSignIn}
          disabled={Boolean(authBusy)}
          className="w-full flex items-center justify-center gap-2.5 rounded-lg border border-border/70 bg-background px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/40 disabled:opacity-50 transition-colors"
        >
          {authBusy === 'google' ? 'Redirecting…' : (
            <>
              <GoogleProviderIcon size={16} />
              Continue with Google
            </>
          )}
        </button>

        {/* ── Guest path ────────────────────────────────────────────── */}
        <div className="border-t border-border/40 pt-4">
          {!guestExpanded ? (
            <button
              type="button"
              onClick={() => setGuestExpanded(true)}
              className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors underline-offset-2 hover:underline"
            >
              Continue as Guest
            </button>
          ) : (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="space-y-3"
              >
                {/* Warning card */}
                <div className="rounded-lg border border-amber-200/80 dark:border-amber-800/40 bg-amber-50/80 dark:bg-amber-950/20 p-3">
                  <div className="flex items-start gap-2.5">
                    <svg
                      width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                      className="flex-shrink-0 text-amber-600 dark:text-amber-400 mt-px"
                      aria-hidden="true"
                    >
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11.5px] font-semibold text-amber-900 dark:text-amber-200 mb-1">
                        Guest data is browser-local only
                      </p>
                      <p className="text-[11px] text-amber-800/70 dark:text-amber-300/60 leading-relaxed">
                        Your events, tasks, and settings will be permanently lost on sign-out,
                        storage clear, account switch, or when using a different device.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGuestExpanded(false)}
                      aria-label="Dismiss"
                      className="flex-shrink-0 p-0.5 text-amber-600/50 hover:text-amber-900 dark:hover:text-amber-200 transition-colors mt-px"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Confirm guest button */}
                <button
                  type="button"
                  onClick={onContinueAsGuest}
                  className="w-full rounded-lg border border-border/60 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  I understand — continue as Guest
                </button>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </StepShell>
  );
});
StepAuth.displayName = 'StepAuth';

/* ═══════════════════════════════════════════════════════════════════════════════
   STEP 1 — About You
══════════════════════════════════════════════════════════════════════════════ */
const StepAboutYou = memo<{
  name: string;
  role: string;
  onChange: (name: string, role: string) => void;
}>(({ name, role, onChange }) => (
  <StepShell
    title="First, introduce yourself."
    description="Lumina personalises your experience and addresses you by name."
  >
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Your name</label>
        <input
          type="text"
          autoFocus
          placeholder="e.g. Sarah Chen"
          value={name}
          onChange={(e) => onChange(e.target.value, role)}
          className="w-full px-3.5 py-2.5 rounded-lg bg-muted/40 border border-border/60 text-sm text-foreground outline-none focus:border-primary/50 placeholder:text-muted-foreground/50 transition-colors duration-150"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Job title <span className="text-muted-foreground/40">(optional)</span>
        </label>
        <input
          type="text"
          placeholder="e.g. Product Designer"
          value={role}
          onChange={(e) => onChange(name, e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-lg bg-muted/40 border border-border/60 text-sm text-foreground outline-none focus:border-primary/50 placeholder:text-muted-foreground/50 transition-colors duration-150"
        />
      </div>
    </div>
  </StepShell>
));
StepAboutYou.displayName = 'StepAboutYou';

/* ═══════════════════════════════════════════════════════════════════════════════
   STEP 1 — Work Schedule
══════════════════════════════════════════════════════════════════════════════ */
const StepWorkSchedule = memo<{
  workStart: string;
  workEnd: string;
  timezone: string;
  onChange: (start: string, end: string) => void;
}>(({ workStart, workEnd, timezone, onChange }) => (
  <StepShell
    title="Your work schedule"
    description="Lumina uses this to calculate scheduling density and suggest focus blocks within your day."
  >
    <div className="grid grid-cols-2 gap-4">
      <TimePicker
        label="Workday starts"
        value={workStart}
        onChange={(v) => onChange(v, workEnd)}
      />
      <TimePicker
        label="Workday ends"
        value={workEnd}
        onChange={(v) => onChange(workStart, v)}
      />
    </div>
  </StepShell>
));
StepWorkSchedule.displayName = 'StepWorkSchedule';

/* ═══════════════════════════════════════════════════════════════════════════════
   STEP 2 — Focus Preference
══════════════════════════════════════════════════════════════════════════════ */
const FOCUS_PREF_OPTIONS: { value: FocusPreference; label: string; desc: string; icon: React.ReactNode }[] = [
  { value: 'morning', label: 'Morning', desc: 'Before 12pm — early riser', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="9" x2="12" y2="2"/><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/></svg> },
  { value: 'midday', label: 'Midday', desc: '12pm – 3pm — peak afternoon', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> },
  { value: 'evening', label: 'Evening', desc: 'After 5pm — night owl', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> },
  { value: 'none', label: 'No preference', desc: 'Lumina will learn from your habits', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c-1.5 0-3 .8-3.5 2C7.5 5 6 6 6 8c0 1-.5 2-1 2.5S4 12 4 13c0 2 1.5 3 3 3h1v3h8v-3h1c1.5 0 3-1 3-3 0-1-.5-1.5-1-2.5S18 9 18 8c0-2-1.5-3-2.5-3C15 3.8 13.5 3 12 3z"/></svg> },
];

const StepFocusPreference = memo<{
  value: FocusPreference;
  onChange: (v: FocusPreference) => void;
}>(({ value, onChange }) => (
  <StepShell
    title="When are you most productive?"
    description="Lumina prioritizes this window when suggesting deep work blocks."
  >
    {FOCUS_PREF_OPTIONS.map((opt) => (
      <OptionButton key={opt.value} selected={value === opt.value} onClick={() => onChange(opt.value)}>
        <span className="text-base select-none">{opt.icon}</span>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{opt.label}</span>
          <span className="text-xs text-muted-foreground font-normal">{opt.desc}</span>
        </div>
      </OptionButton>
    ))}
  </StepShell>
));
StepFocusPreference.displayName = 'StepFocusPreference';

/* ═══════════════════════════════════════════════════════════════════════════════
   STEP 4 — Focus Session Length
═══════════════════════════════════════════════════════════════════════════════ */
const SESSION_OPTIONS: {
  value: FocusSessionLength;
  label: string;
  detail: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
    { value: '25/5', label: '25 / 5', detail: 'Classic Pomodoro', desc: 'Short sprints, frequent breaks', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
    { value: '50/10', label: '50 / 10', detail: 'Deep Work', desc: 'Sustained focus with longer resets', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c-1.5 0-3 .8-3.5 2C7.5 5 6 6 6 8c0 1-.5 2-1 2.5S4 12 4 13c0 2 1.5 3 3 3h1v3h8v-3h1c1.5 0 3-1 3-3 0-1-.5-1.5-1-2.5S18 9 18 8c0-2-1.5-3-2.5-3C15 3.8 13.5 3 12 3z"/></svg> },
    { value: '90/20', label: '90 / 20', detail: 'Ultra Focus', desc: 'Maximum output, one session blocks', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> },
    { value: 'custom', label: 'Custom', detail: 'Set your own', desc: 'Define your own durations', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
  ];

const StepSessionLength = memo<{
  value: FocusSessionLength;
  customFocus: number;
  customBreak: number;
  onChange: (v: FocusSessionLength) => void;
  onCustomChange: (focus: number, brk: number) => void;
}>(({ value, customFocus, customBreak, onChange, onCustomChange }) => (
  <StepShell
    title="Focus session length"
    description="Sets how long each focus block lasts before you take a break."
  >
    <div className="grid grid-cols-1 gap-2">
      {SESSION_OPTIONS.map((opt) => (
        <OptionButton key={opt.value} selected={value === opt.value} onClick={() => onChange(opt.value)}>
          <span className="text-base select-none">{opt.icon}</span>
          <div className="flex-1 flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-base font-semibold tabular-nums">{opt.label}</span>
              <span className="text-xs font-medium text-muted-foreground">{opt.detail}</span>
            </div>
            <span className="text-xs text-muted-foreground font-normal">{opt.desc}</span>
          </div>
        </OptionButton>
      ))}
    </div>
    <AnimatePresence>
      {value === 'custom' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="overflow-hidden"
        >
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Focus (minutes)</label>
              <input
                type="number"
                min={10}
                max={240}
                value={customFocus}
                onChange={(e) => onCustomChange(Number(e.target.value), customBreak)}
                className="w-full px-3 py-2.5 rounded-lg bg-muted/40 border border-border/60 text-sm text-foreground outline-none focus:border-primary/40 dark:focus:border-primary/30 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Break (minutes)</label>
              <input
                type="number"
                min={5}
                max={60}
                value={customBreak}
                onChange={(e) => onCustomChange(customFocus, Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-lg bg-muted/40 border border-border/60 text-sm text-foreground outline-none focus:border-primary/40 dark:focus:border-primary/30 transition-colors"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </StepShell>
));
StepSessionLength.displayName = 'StepSessionLength';

/* ═══════════════════════════════════════════════════════════════════════════════
   STEP 5 — Calendar Sync
   Both providers are independent — connecting one never affects the other.
══════════════════════════════════════════════════════════════════════════════ */

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const StepCalendarSync = memo<{
  googleConnected: boolean;
  microsoftConnected: boolean;
  googleLoading?: boolean;
  outlookLoading?: boolean;
  integrationMessage?: string | null;
  onConnectGoogle: () => void;
  onConnectMicrosoft: () => void;
}>(({ googleConnected, microsoftConnected, googleLoading, outlookLoading, integrationMessage, onConnectGoogle, onConnectMicrosoft }) => {
  const connectedCount = (googleConnected ? 1 : 0) + (microsoftConnected ? 1 : 0);
  const statusText =
    connectedCount === 2
      ? 'Both calendars connected. Events from Google and Outlook will appear in Lumina.'
      : googleConnected
        ? 'Google Calendar connected. You can also connect Outlook.'
        : microsoftConnected
          ? 'Outlook connected. You can also connect Google Calendar.'
          : 'Connect one or both calendars to see meetings alongside your Lumina events.';

  return (
    <StepShell
      title="Sync your calendar"
      description="Lumina detects existing meetings and suggests optimal focus windows around them."
    >
      <div className="grid grid-cols-1 gap-3">
        {/* ── Microsoft Outlook ─────────────────────────────────────────── */}
        <button
          type="button"
          onClick={onConnectMicrosoft}
          disabled={outlookLoading}
          className={cn(
            'flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-colors duration-150 text-left cursor-pointer',
            microsoftConnected
              ? 'border-blue-400/80 dark:border-blue-400/50 bg-blue-50 dark:bg-blue-500/[0.16]'
              : 'border-border bg-background hover:bg-muted/60 dark:hover:bg-muted/40',
            outlookLoading && 'opacity-60 cursor-wait'
          )}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0">
            <OutlookProviderIcon size={24} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              {outlookLoading ? 'Connecting...' : microsoftConnected ? 'Outlook Connected' : 'Connect Outlook'}
            </p>
            <p className="text-xs text-muted-foreground">Microsoft 365 / Outlook.com</p>
          </div>
          {microsoftConnected && (
            <CheckIcon className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
          )}
        </button>

        {/* ── Google Calendar ───────────────────────────────────────────── */}
        <button
          type="button"
          onClick={onConnectGoogle}
          disabled={googleLoading}
          className={cn(
            'flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-colors duration-150 text-left cursor-pointer',
            googleConnected
              ? 'border-red-400/80 dark:border-red-400/50 bg-red-50 dark:bg-red-500/[0.12]'
              : 'border-border bg-background hover:bg-muted/60 dark:hover:bg-muted/40',
            googleLoading && 'opacity-60 cursor-wait'
          )}
        >
          <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 flex items-center justify-center flex-shrink-0">
            <GoogleProviderIcon size={16} className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              {googleLoading ? 'Connecting...' : googleConnected ? 'Google Calendar Connected' : 'Connect Google Calendar'}
            </p>
            <p className="text-xs text-muted-foreground">Google Calendar</p>
          </div>
          {googleConnected && (
            <CheckIcon className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
          )}
        </button>
      </div>

      <p className="text-xs text-muted-foreground/60 pt-1">
        {statusText}
      </p>

      {integrationMessage && (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50/80 dark:bg-amber-400/10 dark:border-amber-400/30 px-3 py-2">
          <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
            {integrationMessage}
          </p>
        </div>
      )}

      {/*
        Skip button intentionally removed — the global footer Continue button
        becomes "Skip for now" when no calendar is connected and "Continue →"
        once a calendar is linked. Having two buttons that fired the same
        action was confusing users.
      */}
    </StepShell>
  );
});
StepCalendarSync.displayName = 'StepCalendarSync';

/* ═══════════════════════════════════════════════════════════════════════════════
   STEP 5 — Focus Goals
══════════════════════════════════════════════════════════════════════════════ */
const GOAL_OPTIONS: { value: FocusGoal; label: string; desc: string; icon: React.ReactNode }[] = [
  { value: 'deep-work', label: 'Deep work consistency', desc: 'Build daily uninterrupted focus habits', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none"><path d="M12 2c.5 3.5-1.5 6-1.5 6s2-.5 3.5 1c1.5 1.5 1 4 1 4s1.5-1 2-3c2 3.5 0 7.5-3 9-3 1.5-7 1-9-1.5S3 12.5 5 9c1-1.5 2.5-3 3-5 .5 2 2 3 4 3V2z" fill="hsl(var(--destructive))" opacity={0.8}/></svg> },
  { value: 'better-scheduling', label: 'Better scheduling', desc: 'Optimise calendar against your peak hours', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { value: 'reduce-switching', label: 'Reduce context switching', desc: 'Decrease fragmentation in your day', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> },
  { value: 'daily-tracking', label: 'Daily focus tracking', desc: 'Monitor and improve over time', icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
];

const StepFocusGoals = memo<{
  selected: FocusGoal[];
  onToggle: (goal: FocusGoal) => void;
}>(({ selected, onToggle }) => (
  <StepShell
    title="What would you like Lumina to help with?"
    description="Select all that apply — this shapes which features Lumina highlights first."
  >
    {GOAL_OPTIONS.map((opt) => (
      <OptionButton
        key={opt.value}
        selected={selected.includes(opt.value)}
        onClick={() => onToggle(opt.value)}
      >
        <span className="text-base select-none">{opt.icon}</span>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{opt.label}</span>
          <span className="text-xs text-muted-foreground font-normal">{opt.desc}</span>
        </div>
      </OptionButton>
    ))}
    {selected.length === 0 && (
      <p className="text-xs text-muted-foreground/50 pt-1">Select at least one to continue.</p>
    )}
  </StepShell>
));
StepFocusGoals.displayName = 'StepFocusGoals';

/* ═══════════════════════════════════════════════════════════════════════════════
   STEP 7 — Completion
══════════════════════════════════════════════════════════════════════════════ */
const StepCompletion = memo<{ name?: string; isGuest?: boolean }>(({ name, isGuest }) => (
  <div className="relative space-y-6">
    {/* Sparkle celebration background */}
    <div className="absolute -top-8 -left-4 -right-4 h-[200px] pointer-events-none">
      <LottieAnimation
        path="/animations/onboarding-complete.json"
        layerColorMap={ONBOARDING_COMPLETE_LAYER_MAP}
        width="100%"
        height="100%"
        loop={false}
        autoplay={true}
      />
    </div>

    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.1, duration: 0.4, ease: [0.34, 1.2, 0.64, 1] }}
      className="relative z-10 w-12 h-12 rounded-xl border border-primary/30 bg-primary/[0.08] flex items-center justify-center"
    >
      <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    </motion.div>

    <div className="relative z-10 space-y-2">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
        You're ready{name ? `, ${name.split(' ')[0]}` : ''}.
      </h1>
      <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
        Open your calendar, add your first event, and start your first focus session.
      </p>
    </div>

    {isGuest && (
      <div className="rounded-lg border border-amber-200/80 dark:border-amber-800/40 bg-amber-50/80 dark:bg-amber-950/20 p-3">
        <div className="flex items-start gap-2.5">
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            className="flex-shrink-0 text-amber-600 dark:text-amber-400 mt-px"
            aria-hidden="true"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p className="text-[11px] text-amber-800/80 dark:text-amber-300/70 leading-relaxed">
            <span className="font-semibold text-amber-900 dark:text-amber-200">Guest mode active — </span>
            your data is saved in this browser only. To keep it permanently,{' '}
            <a href="/onboarding" className="underline underline-offset-2 font-medium hover:opacity-70 transition-opacity">
              create a free account
            </a>
            {' '}at any time.
          </p>
        </div>
      </div>
    )}
  </div>
));
StepCompletion.displayName = 'StepCompletion';

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN ONBOARDING FLOW
══════════════════════════════════════════════════════════════════════════════ */
const OnboardingFlow: React.FC = () => {
  const router = useRouter();
  const store = useOnboardingStore();
  const setGlobalFocusSessionLength = useSettingsStore((s) => s.setFocusSessionLength);
  const calStore = useCalendarStore();
  const plannerStore = usePlannerStore();
  const authClient = useLuminaAuthClient();
  const isGuest = useGuestStore((s) => s.isGuest);
  const setGuest = useGuestStore((s) => s.setGuest);
  const {
    data: authData,
    isPending: authSessionPending,
    error: authSessionError,
    refetch: refetchAuthSession,
  } = authClient.useSession();
  const [direction, setDirection] = useState<number>(1);
  const [step, setStep] = useState<number>(0);
  const [outlookLoading, setOutlookLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authBusy, setAuthBusy] = useState<'signup' | 'signin' | 'google' | 'microsoft' | 'signout' | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [integrationMessage, setIntegrationMessage] = useState<string | null>(null);

  const authUser = authData?.user ?? null;
  const authSession = authData?.session ?? null;
  const onboardingUserName = store.userName;
  const onboardingUserRole = store.userRole;
  const setOnboardingUserInfo = store.setUserInfo;
  const authStatus: 'loading' | 'logged out' | 'logged in' = authSessionPending
    ? 'loading'
    : authUser && authSession
      ? 'logged in'
      : 'logged out';

  const clearAuthMessage = useCallback(() => {
    setAuthMessage(null);
  }, []);

  const clearIntegrationMessage = useCallback(() => {
    setIntegrationMessage(null);
  }, []);

  const switchToSignUp = useCallback(() => {
    clearAuthMessage();
    setAuthMode('signup');
  }, [clearAuthMessage]);

  const switchToSignIn = useCallback(() => {
    clearAuthMessage();
    setAuthMode('signin');
  }, [clearAuthMessage]);

  const hydrateNameFromSession = useCallback(async () => {
    const getSession = (authClient as { getSession?: () => Promise<unknown> }).getSession;
    if (typeof getSession !== 'function') return;

    const sessionResult = await getSession();
    const user = (sessionResult as { data?: { user?: { name?: string | null } } })?.data?.user;
    const sessionName = user?.name?.trim();

    if (sessionName && !onboardingUserName.trim()) {
      setOnboardingUserInfo(sessionName, onboardingUserRole);
    }
    if (sessionName) {
      setAuthName((current) => (current.trim() ? current : sessionName));
    }
  }, [authClient, onboardingUserName, onboardingUserRole, setOnboardingUserInfo]);

  React.useEffect(() => {
    void hydrateNameFromSession();
  }, [hydrateNameFromSession, authStatus]);

  // Auto-advance past the Welcome step when the user arrives already signed in
  React.useEffect(() => {
    if (step === 0 && authStatus === 'logged in') {
      setDirection(1);
      setStep(1);
    }
  }, [step, authStatus]);

  const startSocialSignInPopup = useCallback(async (provider: 'google' | 'microsoft'): Promise<boolean> => {
    const socialSignIn = (authClient.signIn as any)?.social;
    if (typeof socialSignIn !== 'function') {
      const label = provider === 'google' ? 'Google' : 'Microsoft';
      throw new Error(`${label} sign-in is unavailable in the current auth client.`);
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
      `popup=yes,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)},resizable=yes,scrollbars=yes`
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
        try {
          popup.close();
        } catch {
          // noop
        }
        resolve(false);
      }, 3 * 60 * 1000);

      window.addEventListener('message', onMessage);
    });
  }, [authClient]);

  const handleAuthSignUp = useCallback(async () => {
    clearAuthMessage();

    const normalizedName = authName.trim();
    const normalizedEmail = authEmail.trim().toLowerCase();

    if (normalizedName.length < 2) {
      setAuthMessage('Please enter your full name (at least 2 characters).');
      return;
    }

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setAuthMessage('Please enter a valid email address.');
      return;
    }

    if (authPassword.length < 6) {
      setAuthMessage('Password must be at least 6 characters.');
      return;
    }

    setAuthBusy('signup');
    try {
      const result = await authClient.signUp.email({
        email: normalizedEmail,
        password: authPassword,
        name: normalizedName,
        callbackURL: '/onboarding',
      });
      if (result.error) {
        setAuthMessage(result.error.message ?? 'Sign up failed.');
        return;
      }
      await refetchAuthSession();
      await hydrateNameFromSession();
      if (!onboardingUserName.trim()) {
        setOnboardingUserInfo(normalizedName, onboardingUserRole);
      }
      setAuthMessage('Signed up successfully.');
    } finally {
      setAuthBusy(null);
    }
  }, [
    authClient,
    authEmail,
    authName,
    authPassword,
    clearAuthMessage,
    hydrateNameFromSession,
    refetchAuthSession,
    onboardingUserName,
    onboardingUserRole,
    setOnboardingUserInfo,
  ]);

  const handleAuthSignIn = useCallback(async () => {
    clearAuthMessage();
    const normalizedEmail = authEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setAuthMessage('Please enter a valid email address.');
      return;
    }

    if (!authPassword) {
      setAuthMessage('Please enter your password.');
      return;
    }

    setAuthBusy('signin');
    try {
      const result = await authClient.signIn.email({
        email: normalizedEmail,
        password: authPassword,
        callbackURL: '/onboarding',
      });
      if (result.error) {
        setAuthMessage(result.error.message ?? 'Sign in failed.');
        return;
      }
      await refetchAuthSession();
      await hydrateNameFromSession();
      setAuthMessage('Signed in successfully.');
    } finally {
      setAuthBusy(null);
    }
  }, [
    authClient,
    authEmail,
    authPassword,
    clearAuthMessage,
    hydrateNameFromSession,
    refetchAuthSession,
  ]);

  const handleGoogleSignIn = useCallback(async () => {
    clearAuthMessage();
    setAuthBusy('google');
    try {
      const completed = await startSocialSignInPopup('google');
      if (!completed) {
        setAuthMessage('Google sign-in was cancelled.');
        return;
      }

      await refetchAuthSession();
      await hydrateNameFromSession();
      setAuthMessage('Signed in with Google.');
    } catch (err: unknown) {
      setAuthMessage(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setAuthBusy(null);
    }
  }, [
    clearAuthMessage,
    hydrateNameFromSession,
    refetchAuthSession,
    startSocialSignInPopup,
  ]);

  const handleAuthSignOut = useCallback(async () => {
    clearAuthMessage();
    setAuthBusy('signout');
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setAuthMessage(result.error.message ?? 'Sign out failed.');
        return;
      }
      await refetchAuthSession();
      setAuthMessage('Signed out.');
    } finally {
      setAuthBusy(null);
    }
  }, [authClient, clearAuthMessage, refetchAuthSession]);

  /**
   * Opens the integration OAuth popup for a given provider.
   * Navigates to our connect endpoint which redirects to the provider's
   * OAuth screen with the appropriate calendar scopes, then stores tokens
   * in the DB before handing off to /auth/popup-complete.
   */
  const openIntegrationPopup = useCallback(
    async (provider: IntegrationProvider): Promise<IntegrationPopupResult> => {
      const url = `/api/integrations/${provider}/connect`;
      const width = 520;
      const height = 700;
      const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
      const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);

      const popup = window.open(
        url,
        `lumina-integration-${provider}`,
        `popup=yes,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)},resizable=yes,scrollbars=yes`,
      );

      if (!popup) {
        return { ok: false, reason: 'popup-blocked' };
      }
      popup.focus();

      return new Promise<IntegrationPopupResult>((resolve) => {
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
            const error = (data as { error?: unknown }).error;
            settled = true;
            cleanup();
            resolve({
              ok: false,
              reason: 'message-error',
              error: typeof error === 'string' ? error : null,
            });
            return;
          }
          settled = true;
          cleanup();
          resolve({ ok: true });
        };
        const pollId = window.setInterval(() => {
          if (!settled && popup.closed) {
            settled = true;
            cleanup();
            resolve({ ok: false, reason: 'closed' });
          }
        }, 350);
        const timeoutId = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          try { popup.close(); } catch { /* noop */ }
          resolve({ ok: false, reason: 'timeout' });
        }, 3 * 60 * 1000);
        window.addEventListener('message', onMessage);
      });
    },
    [],
  );

  const syncIntegrationState = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/status', { cache: 'no-store' });
      if (!res.ok) {
        store.setGoogleConnected(false);
        store.setMicrosoftConnected(false);
        plannerStore.setOutlookConnected(false);
        plannerStore.setOutlookEvents([]);
        return { google: false, microsoft: false };
      }

      const data = (await res.json()) as {
        google?: { connected: boolean };
        microsoft?: { connected: boolean };
      };

      const google = Boolean(data.google?.connected);
      const microsoft = Boolean(data.microsoft?.connected);

      store.setGoogleConnected(google);
      store.setMicrosoftConnected(microsoft);
      plannerStore.setOutlookConnected(microsoft);

      if (!microsoft) {
        plannerStore.setOutlookEvents([]);
      }

      return { google, microsoft };
    } catch {
      store.setGoogleConnected(false);
      store.setMicrosoftConnected(false);
      plannerStore.setOutlookConnected(false);
      plannerStore.setOutlookEvents([]);
      return { google: false, microsoft: false };
    }
  }, [plannerStore, store]);

  const confirmIntegration = useCallback(async (provider: IntegrationProvider) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const status = await syncIntegrationState();
      const connected = provider === 'google' ? status.google : status.microsoft;
      if (connected) return true;
      if (attempt < 2) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
      }
    }

    return false;
  }, [syncIntegrationState]);

  // ── Outlook / Microsoft connect (independent of Google) ─────────────────
  const handleOnboardingMicrosoftConnect = useCallback(async () => {
    clearIntegrationMessage();
    if (store.microsoftConnected) {
      await fetch('/api/integrations/microsoft/disconnect', { method: 'POST' }).catch(
        () => { /* non-critical, best-effort */ },
      );
      await syncIntegrationState();
      setIntegrationMessage(null);
      return;
    }

    clearAuthMessage();
    setOutlookLoading(true);
    setAuthBusy('microsoft');
    try {
      const popupResult = await openIntegrationPopup('microsoft');

      if (!popupResult.ok) {
        await syncIntegrationState();
        setIntegrationMessage(getIntegrationFailureMessage('microsoft', popupResult));
        return;
      }

      const confirmed = await confirmIntegration('microsoft');
      if (!confirmed) {
        setIntegrationMessage(
          getIntegrationFailureMessage('microsoft', {
            ok: false,
            reason: 'status-false',
          }),
        );
        return;
      }

      setIntegrationMessage(null);
    } catch (err: unknown) {
      console.error('[Onboarding Outlook]', err);
      await syncIntegrationState();
      setIntegrationMessage('Outlook OAuth failed. Connection was not completed. Try again in a regular browser window.');
    } finally {
      setAuthBusy(null);
      setOutlookLoading(false);
    }
  }, [
    clearAuthMessage,
    clearIntegrationMessage,
    confirmIntegration,
    openIntegrationPopup,
    store.microsoftConnected,
    syncIntegrationState,
  ]);

  // ── Google Calendar connect (independent of Outlook) ────────────────────
  const handleOnboardingGoogleConnect = useCallback(async () => {
    clearIntegrationMessage();
    if (store.googleConnected) {
      await fetch('/api/integrations/google/disconnect', { method: 'POST' }).catch(
        () => { /* non-critical, best-effort */ },
      );
      await syncIntegrationState();
      setIntegrationMessage(null);
      return;
    }

    clearAuthMessage();
    setGoogleLoading(true);
    setAuthBusy('google');
    try {
      const popupResult = await openIntegrationPopup('google');

      if (!popupResult.ok) {
        await syncIntegrationState();
        setIntegrationMessage(getIntegrationFailureMessage('google', popupResult));
        return;
      }

      const confirmed = await confirmIntegration('google');
      if (!confirmed) {
        setIntegrationMessage(
          getIntegrationFailureMessage('google', {
            ok: false,
            reason: 'status-false',
          }),
        );
        return;
      }

      setIntegrationMessage(null);
    } catch (err: unknown) {
      console.error('[Onboarding Google]', err);
      await syncIntegrationState();
      setIntegrationMessage('Google OAuth failed. Connection was not completed. Try again in a regular browser window.');
    } finally {
      setAuthBusy(null);
      setGoogleLoading(false);
    }
  }, [
    clearAuthMessage,
    clearIntegrationMessage,
    confirmIntegration,
    openIntegrationPopup,
    store.googleConnected,
    syncIntegrationState,
  ]);

  const handleContinueAsGuest = useCallback(() => {
    setGuest(true);
    setDirection(1);
    setStep((s) => s + 1);
  }, [setGuest]);

  const canContinue = useCallback((): boolean => {
    if (step === 1) return authStatus === 'logged in' || isGuest;
    if (step === 2) return store.userName.trim().length > 0;
    if (step === 7) return store.focusGoals.length > 0;
    return true;
  }, [step, authStatus, isGuest, store.userName, store.focusGoals.length]);

  const handleSessionLengthChange = useCallback((selection: FocusSessionLength) => {
    store.setFocusSessionLength(selection);
    const minutes = focusSessionSelectionToMinutes(selection, store.customFocusMinutes);
    setGlobalFocusSessionLength(minutes);
    // Propagate to the Pomodoro store so the timer respects the user's
    // onboarding choice. Break length has no DB field — it lives in the
    // Pomodoro store (localStorage) and is pushed here explicitly.
    const breakMins = selection === '25/5'
      ? 5
      : selection === '50/10'
        ? 10
        : selection === '90/20'
          ? 20
          : store.customBreakMinutes;
    const pomo = usePomodoroStore.getState();
    pomo.setWorkMins(minutes);
    pomo.setShortBreakMins(breakMins);
  }, [setGlobalFocusSessionLength, store]);

  const handleCustomSessionLengthChange = useCallback((focusMinutes: number, breakMinutes: number) => {
    store.setFocusSessionLength('custom', focusMinutes, breakMinutes);
    setGlobalFocusSessionLength(focusSessionSelectionToMinutes('custom', focusMinutes));
    const pomo = usePomodoroStore.getState();
    pomo.setWorkMins(focusMinutes);
    pomo.setShortBreakMins(breakMinutes);
  }, [setGlobalFocusSessionLength, store]);

  const goNext = useCallback(() => {
    if (!canContinue()) return;
    if (step === 8) {
      // Completion — save name + role to calendar profile, then mark done
      calStore.updateProfile({
        name: store.userName || calStore.profile.name,
        role: store.userRole || calStore.profile.role,
      });
      store.complete();
      router.replace('/calendar');
      return;
    }
    setDirection(1);
    setStep((s) => s + 1);
  }, [step, canContinue, store, calStore, router]);

  const goBack = useCallback(() => {
    if (step === 0) return;
    setDirection(-1);
    setStep((s) => s - 1);
  }, [step]);

  // Keyboard enter / arrow nav (not on inputs)
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Enter') goNext();
      if (e.key === 'ArrowLeft' && step > 0) goBack();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goBack, step]);

  const renderStep = () => {
    switch (step) {
      case 0:
        return <StepWelcome />;
      case 1:
        return (
          <StepAuth
            authStatus={authStatus}
            authUserEmail={authUser?.email ?? null}
            authUserName={authUser?.name ?? null}
            authUserImage={authUser?.image ?? null}
            authMode={authMode}
            authName={authName}
            authEmail={authEmail}
            authPassword={authPassword}
            authBusy={authBusy}
            authMessage={authMessage ?? authSessionError?.message ?? null}
            onAuthNameChange={setAuthName}
            onAuthEmailChange={setAuthEmail}
            onAuthPasswordChange={setAuthPassword}
            onSignUp={handleAuthSignUp}
            onSignIn={handleAuthSignIn}
            onGoogleSignIn={handleGoogleSignIn}
            onSignOut={handleAuthSignOut}
            onSwitchToSignUp={switchToSignUp}
            onSwitchToSignIn={switchToSignIn}
            onContinueAsGuest={handleContinueAsGuest}
          />
        );
      case 2:
        return (
          <StepAboutYou
            name={store.userName}
            role={store.userRole}
            onChange={(n, r) => store.setUserInfo(n, r)}
          />
        );
      case 3:
        return (
          <StepWorkSchedule
            workStart={store.workStart}
            workEnd={store.workEnd}
            timezone={store.timezone}
            onChange={(s, e) => store.setWorkSchedule(s, e)}
          />
        );
      case 4:
        return (
          <StepFocusPreference
            value={store.focusPreference}
            onChange={store.setFocusPreference}
          />
        );
      case 5:
        return (
          <StepSessionLength
            value={store.focusSessionLength}
            customFocus={store.customFocusMinutes}
            customBreak={store.customBreakMinutes}
            onChange={handleSessionLengthChange}
            onCustomChange={handleCustomSessionLengthChange}
          />
        );
      case 6:
        return (
          <StepCalendarSync
            googleConnected={store.googleConnected}
            microsoftConnected={store.microsoftConnected}
            googleLoading={googleLoading}
            outlookLoading={outlookLoading}
            integrationMessage={integrationMessage}
            onConnectGoogle={handleOnboardingGoogleConnect}
            onConnectMicrosoft={handleOnboardingMicrosoftConnect}
          />
        );
      case 7:
        return (
          <StepFocusGoals
            selected={store.focusGoals}
            onToggle={store.toggleFocusGoal}
          />
        );
      case 8:
        return <StepCompletion name={store.userName || calStore.profile.name} isGuest={isGuest} />;
    }
  };

  const isLastStep = step === 8;
  const isFirstStep = step === 0;
  // Progress dots only for steps 1–7 (exclude welcome=0 and completion=8)
  const showProgress = step >= 1 && step <= 7;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-4">
      {/* Card container — constrained width, card surface, vertically centered */}
      <div className="relative w-full max-w-[480px] bg-card border border-border/60 rounded-2xl shadow-elevated flex flex-col">
        {/* Progress bar strip at top of card */}
        {showProgress && (
          <div className="px-8 pt-6 pb-0">
            <ProgressDots step={step - 1} total={7} />
          </div>
        )}

        {/* Step content */}
        <div className="relative overflow-hidden px-8 py-8">
          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={step}
              custom={direction}
              variants={SLIDE_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              transition={TRANSITION}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-8 pb-7 pt-0">
          <button
            type="button"
            onClick={goBack}
            disabled={isFirstStep}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150',
              isFirstStep
                ? 'opacity-0 pointer-events-none'
                : 'border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer'
            )}
          >
            Back
          </button>

          {(() => {
            // Calendar-sync step (step 6): context-aware label.
            //   - No calendar connected → "Skip for now" (no arrow)
            //   - At least one connected → "Continue →" (normal)
            // This replaces the old duplicate "Skip" button that lived inside
            // StepCalendarSync and fired the same goNext action.
            const onCalendarStep = step === 6;
            const hasCalendarConnected =
              store.googleConnected || store.microsoftConnected;
            const showSkipLabel = onCalendarStep && !hasCalendarConnected;

            const label = isFirstStep
              ? 'Start Setup'
              : isLastStep
                ? 'Enter Workspace'
                : showSkipLabel
                  ? 'Skip for now'
                  : 'Continue';

            const showArrow = !isFirstStep && !isLastStep && !showSkipLabel;

            return (
              <button
                type="button"
                onClick={goNext}
                disabled={!canContinue()}
                className={cn(
                  'flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors duration-150',
                  canContinue()
                    ? showSkipLabel
                      ? 'border border-border/60 text-foreground hover:bg-muted/50 cursor-pointer'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer'
                    : 'bg-muted text-muted-foreground/60 cursor-not-allowed opacity-60'
                )}
              >
                {label}
                {showArrow && (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default OnboardingFlow;
