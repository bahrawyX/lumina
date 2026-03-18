'use client';

import React, { useState, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore, FocusPreference, FocusSessionLength, FocusGoal } from '../store/useOnboardingStore';
import { useCalendarStore } from '../store/useCalendarStore';
import { usePlannerStore } from '../store/usePlannerStore';
import { cn } from '../lib/utils';
import TimePicker from './TimePicker';
import { useLuminaAuthClient } from './AuthProvider';

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const TOTAL_STEPS = 7; // 0..6

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
        { text: 'Track your focus patterns' },
        { text: 'Suggest optimal work windows' },
        { text: 'Power your flow sessions' },
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
const StepAuth = memo<{
  authStatus: 'loading' | 'logged out' | 'logged in';
  authUserEmail: string | null;
  authEmail: string;
  authPassword: string;
  authBusy: 'signup' | 'signin' | 'google' | 'signout' | 'microsoft' | null;
  authMessage: string | null;
  onAuthEmailChange: (value: string) => void;
  onAuthPasswordChange: (value: string) => void;
  onSignUp: () => void;
  onSignIn: () => void;
  onGoogleSignIn: () => void;
  onSignOut: () => void;
}>(({ authStatus, authUserEmail, authEmail, authPassword, authBusy, authMessage, onAuthEmailChange, onAuthPasswordChange, onSignUp, onSignIn, onGoogleSignIn, onSignOut }) => (
  <StepShell
    title="Secure your workspace"
    description="Sign in once and your settings follow you across sessions and devices."
  >
    {authStatus === 'logged in' ? (
      <div className="space-y-3">
        <div className="rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-3.5">
          <p className="text-xs text-muted-foreground mb-1">Connected account</p>
          <p className="text-sm font-medium text-foreground break-all">{authUserEmail ?? 'user'}</p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          disabled={Boolean(authBusy)}
          className="w-full rounded-lg border border-border/70 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors"
        >
          {authBusy === 'signout' ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    ) : (
      <div className="space-y-3">
        <div className="space-y-2">
          <input
            type="email"
            name="onboarding-auth-email"
            value={authEmail}
            onChange={(e) => onAuthEmailChange(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            className="w-full px-3.5 py-2.5 rounded-xl bg-muted/40 border border-border/60 text-sm text-foreground outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground/50"
          />
          <input
            type="password"
            name="onboarding-auth-password"
            value={authPassword}
            onChange={(e) => onAuthPasswordChange(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className="w-full px-3.5 py-2.5 rounded-xl bg-muted/40 border border-border/60 text-sm text-foreground outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Primary action: Sign In — full width */}
        <button
          type="button"
          onClick={onSignIn}
          disabled={Boolean(authBusy) || !authEmail.trim() || !authPassword}
          className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {authBusy === 'signin' ? 'Signing in…' : 'Sign In'}
        </button>

        <div className="relative py-0.5">
          <div className="h-px bg-border/60" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60 bg-card">
            or
          </span>
        </div>

        {/* Secondary actions */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={Boolean(authBusy)}
            className="w-full flex items-center justify-center gap-2.5 rounded-lg border border-border/70 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors"
          >
            {authBusy === 'google' ? (
              'Redirecting…'
            ) : (
              <>
                {/* Google brand icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.591 4.418 1.582l3.491-3.49A11.932 11.932 0 0 0 12 0C7.27 0 3.198 2.698 1.24 6.65l4.026 3.115z" />
                  <path fill="#34A853" d="M16.041 18.013A7.072 7.072 0 0 1 12 19.09c-2.973 0-5.535-1.853-6.6-4.487l-4.04 3.066C3.193 21.294 7.265 24 12 24c2.933 0 5.735-1.043 7.834-3.001l-3.793-2.986z" />
                  <path fill="#4A90E2" d="M19.834 20.999C22.029 18.952 23.455 15.904 23.455 12c0-.71-.091-1.418-.273-2.09H12v4.545h6.436a5.463 5.463 0 0 1-1.638 2.902l3.036 2.642z" />
                  <path fill="#FBBC05" d="M5.4 14.603A7.15 7.15 0 0 1 4.909 12c0-.56.076-1.104.214-1.624L1.24 7.26A11.981 11.981 0 0 0 0 12c0 1.92.444 3.73 1.237 5.335L5.4 14.603z" />
                </svg>
                Continue with Google
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onSignUp}
            disabled={Boolean(authBusy)}
            className="w-full rounded-lg border border-border/50 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {authBusy === 'signup' ? 'Signing up…' : 'Create account'}
          </button>
        </div>
      </div>
    )}

    {authMessage && (
      <p className="text-xs text-muted-foreground/80 pt-1">{authMessage}</p>
    )}
  </StepShell>
));
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
          className="w-full px-3.5 py-2.5 rounded-xl bg-muted/40 border border-border/60 text-sm text-foreground outline-none focus:border-primary/50 placeholder:text-muted-foreground/50 transition-colors duration-150"
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
          className="w-full px-3.5 py-2.5 rounded-xl bg-muted/40 border border-border/60 text-sm text-foreground outline-none focus:border-primary/50 placeholder:text-muted-foreground/50 transition-colors duration-150"
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
const FOCUS_PREF_OPTIONS: { value: FocusPreference; label: string; desc: string; icon: string }[] = [
  { value: 'morning', label: 'Morning', desc: 'Before 12pm — early riser', icon: '🌅' },
  { value: 'midday', label: 'Midday', desc: '12pm – 3pm — peak afternoon', icon: '☀️' },
  { value: 'evening', label: 'Evening', desc: 'After 5pm — night owl', icon: '🌙' },
  { value: 'none', label: 'No preference', desc: 'Lumina will learn from your habits', icon: '🧠' },
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
  icon: string;
}[] = [
    { value: '25/5', label: '25 / 5', detail: 'Classic Pomodoro', desc: 'Short sprints, frequent breaks', icon: '⏱️' },
    { value: '50/10', label: '50 / 10', detail: 'Deep Work', desc: 'Sustained focus with longer resets', icon: '🧠' },
    { value: '90/20', label: '90 / 20', detail: 'Ultra Focus', desc: 'Maximum output, one session blocks', icon: '⚡' },
    { value: 'custom', label: 'Custom', detail: 'Set your own', desc: 'Define your own durations', icon: '⚙️' },
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
    description="This configures the Ignite Flow engine — how long you focus before a break."
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
                className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-muted/40 border border-gray-200 dark:border-border/60 text-sm text-foreground outline-none focus:border-primary/40 dark:focus:border-primary/30 transition-colors"
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
                className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-muted/40 border border-gray-200 dark:border-border/60 text-sm text-foreground outline-none focus:border-primary/40 dark:focus:border-primary/30 transition-colors"
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
  onConnectGoogle: () => void;
  onConnectMicrosoft: () => void;
  onSkip: () => void;
}>(({ googleConnected, microsoftConnected, googleLoading, outlookLoading, onConnectGoogle, onConnectMicrosoft, onSkip }) => {
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
            <svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill="#0277bd" d="M28.093 33H40c2.209 0 4-1.791 4-4V19c0-2.209-1.791-4-4-4H28.093v18z"/>
              <path fill="#03a9f4" d="M16 15L28.093 15 28.093 33 16 33z"/>
              <path fill="#4fc3f7" d="M28.093 20L38 20 38 28 28.093 28z"/>
              <path fill="#0288d1" d="M21 11H6c-2.209 0-4 1.791-4 4v18c0 2.209 1.791 4 4 4h15V11z"/>
              <path fill="#fff" d="M12.915 26.687c-2.31 0-3.921-1.666-3.921-4.062s1.583-4.103 3.935-4.103c2.31 0 3.894 1.638 3.894 4.075S15.225 26.687 12.915 26.687zM12.929 20.081c-1.391 0-2.233 1.055-2.233 2.544 0 1.502.828 2.502 2.219 2.502 1.405 0 2.219-1.027 2.219-2.516C15.134 21.08 14.334 20.081 12.929 20.081z"/>
            </svg>
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
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M5.26620003,9.76452941 C6.19878754,6.93863203 8.85444915,4.90909091 12,4.90909091 C13.6909091,4.90909091 15.2181818,5.50909091 16.4181818,6.49090909 L19.9090909,3 C17.7818182,1.14545455 15.0545455,0 12,0 C7.27006974,0 3.1977497,2.69829785 1.23999023,6.65002441 L5.26620003,9.76452941 Z" />
              <path fill="#34A853" d="M16.0407269,18.0125889 C14.9509167,18.7163016 13.5660892,19.0909091 12,19.0909091 C8.86648613,19.0909091 6.21911939,17.076871 5.27698177,14.2678769 L1.23746264,17.3349879 C3.19279051,21.2936293 7.26500293,24 12,24 C14.9328362,24 17.7353462,22.9573905 19.834192,20.9995801 L16.0407269,18.0125889 Z" />
              <path fill="#4A90E2" d="M19.834192,20.9995801 C22.0291676,18.9520994 23.4545455,15.903663 23.4545455,12 C23.4545455,11.2909091 23.3454545,10.5818182 23.1818182,9.90909091 L12,9.90909091 L12,14.4545455 L18.4363636,14.4545455 C18.1187732,16.013626 17.2662994,17.2212117 16.0407269,18.0125889 L19.834192,20.9995801 Z" />
              <path fill="#FBBC05" d="M5.27698177,14.2678769 C5.03832634,13.556323 4.90909091,12.7937589 4.90909091,12 C4.90909091,11.2182781 5.03443647,10.4668121 5.26620003,9.76452941 L1.23999023,6.65002441 C0.43658717,8.26043162 0,10.0753848 0,12 C0,13.9195484 0.444780743,15.7301709 1.23746264,17.3349879 L5.27698177,14.2678769 Z" />
            </svg>
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

      <p className="text-xs text-gray-400 dark:text-muted-foreground/60 pt-1">
        {statusText}
      </p>

      <button
        type="button"
        onClick={onSkip}
        className="w-full text-center text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors py-1 cursor-pointer"
      >
        Skip — I don't use a calendar right now
      </button>
    </StepShell>
  );
});
StepCalendarSync.displayName = 'StepCalendarSync';

/* ═══════════════════════════════════════════════════════════════════════════════
   STEP 5 — Focus Goals
══════════════════════════════════════════════════════════════════════════════ */
const GOAL_OPTIONS: { value: FocusGoal; label: string; desc: string; icon: string }[] = [
  { value: 'deep-work', label: 'Deep work consistency', desc: 'Build daily uninterrupted focus habits', icon: '🔥' },
  { value: 'better-scheduling', label: 'Better scheduling', desc: 'Optimise calendar against your peak hours', icon: '📅' },
  { value: 'reduce-switching', label: 'Reduce context switching', desc: 'Decrease fragmentation in your day', icon: '🎯' },
  { value: 'daily-tracking', label: 'Daily focus tracking', desc: 'Monitor and improve over time', icon: '📊' },
];

const StepFocusGoals = memo<{
  selected: FocusGoal[];
  onToggle: (goal: FocusGoal) => void;
}>(({ selected, onToggle }) => (
  <StepShell
    title="What would you like Lumina to help with?"
    description="Select all that apply. Lumina tailors its intelligence engine to your priorities."
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
      <p className="text-xs text-gray-400 dark:text-muted-foreground/50 pt-1">Select at least one to continue.</p>
    )}
  </StepShell>
));
StepFocusGoals.displayName = 'StepFocusGoals';

/* ═══════════════════════════════════════════════════════════════════════════════
   STEP 7 — Completion
══════════════════════════════════════════════════════════════════════════════ */
const StepCompletion = memo<{ name?: string }>(({ name }) => (
  <div className="space-y-6">
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.1, duration: 0.4, ease: [0.34, 1.2, 0.64, 1] }}
      className="w-12 h-12 rounded-xl border border-primary/30 bg-primary/[0.08] flex items-center justify-center"
    >
      <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    </motion.div>

    <div className="space-y-2">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
        You're ready{name ? `, ${name.split(' ')[0]}` : ''}.
      </h1>
      <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
        Open your calendar, add your first event, and start your first focus session.
      </p>
    </div>
  </div>
));
StepCompletion.displayName = 'StepCompletion';

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN ONBOARDING FLOW
══════════════════════════════════════════════════════════════════════════════ */
const OnboardingFlow: React.FC = () => {
  const router = useRouter();
  const store = useOnboardingStore();
  const calStore = useCalendarStore();
  const plannerStore = usePlannerStore();
  const authClient = useLuminaAuthClient();
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
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authBusy, setAuthBusy] = useState<'signup' | 'signin' | 'google' | 'microsoft' | 'signout' | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const authUser = authData?.user ?? null;
  const authSession = authData?.session ?? null;
  const authStatus: 'loading' | 'logged out' | 'logged in' = authSessionPending
    ? 'loading'
    : authUser && authSession
      ? 'logged in'
      : 'logged out';

  const clearAuthMessage = useCallback(() => {
    setAuthMessage(null);
  }, []);

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
    setAuthBusy('signup');
    try {
      const normalizedEmail = authEmail.trim().toLowerCase();
      const fallbackName = normalizedEmail.split('@')[0] || 'Lumina User';
      const result = await authClient.signUp.email({
        email: normalizedEmail,
        password: authPassword,
        name: fallbackName,
        callbackURL: '/onboarding',
      });
      if (result.error) {
        setAuthMessage(result.error.message ?? 'Sign up failed.');
        return;
      }
      await refetchAuthSession();
      setAuthMessage('Signed up successfully.');
    } finally {
      setAuthBusy(null);
    }
  }, [authClient, authEmail, authPassword, clearAuthMessage, refetchAuthSession]);

  const handleAuthSignIn = useCallback(async () => {
    clearAuthMessage();
    setAuthBusy('signin');
    try {
      const result = await authClient.signIn.email({
        email: authEmail.trim().toLowerCase(),
        password: authPassword,
        callbackURL: '/onboarding',
      });
      if (result.error) {
        setAuthMessage(result.error.message ?? 'Sign in failed.');
        return;
      }
      await refetchAuthSession();
      setAuthMessage('Signed in successfully.');
    } finally {
      setAuthBusy(null);
    }
  }, [authClient, authEmail, authPassword, clearAuthMessage, refetchAuthSession]);

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
      setAuthMessage('Signed in with Google.');
    } catch (err: any) {
      setAuthMessage(err?.message ?? 'Google sign-in failed.');
    } finally {
      setAuthBusy(null);
    }
  }, [clearAuthMessage, refetchAuthSession, startSocialSignInPopup]);

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
    async (provider: 'google' | 'microsoft'): Promise<boolean> => {
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

      if (!popup) throw new Error('Popup blocked. Please allow popups and try again.');
      popup.focus();

      return new Promise<boolean>((resolve) => {
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
          settled = true;
          cleanup();
          resolve(true);
        };
        const pollId = window.setInterval(() => {
          if (!settled && popup.closed) { settled = true; cleanup(); resolve(false); }
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
    },
    [],
  );

  // ── Outlook / Microsoft connect (independent of Google) ─────────────────
  const handleOnboardingMicrosoftConnect = useCallback(async () => {
    if (store.microsoftConnected) {
      store.setMicrosoftConnected(false);
      plannerStore.setOutlookConnected(false);
      plannerStore.setOutlookEvents([]);
      return;
    }

    clearAuthMessage();
    setOutlookLoading(true);
    setAuthBusy('microsoft');
    try {
      const completed = await openIntegrationPopup('microsoft');
      if (!completed) {
        setAuthMessage('Outlook connection was cancelled.');
        return;
      }
      store.setMicrosoftConnected(true);
      plannerStore.setOutlookConnected(true);
      setAuthMessage('Outlook calendar connected.');
    } catch (err: unknown) {
      console.error('[Onboarding Outlook]', err);
      store.setMicrosoftConnected(false);
      plannerStore.setOutlookConnected(false);
      plannerStore.setOutlookEvents([]);
      setAuthMessage(err instanceof Error ? err.message : 'Outlook connection failed.');
    } finally {
      setAuthBusy(null);
      setOutlookLoading(false);
    }
  }, [clearAuthMessage, openIntegrationPopup, plannerStore, store]);

  // ── Google Calendar connect (independent of Outlook) ────────────────────
  const handleOnboardingGoogleConnect = useCallback(async () => {
    if (store.googleConnected) {
      store.setGoogleConnected(false);
      return;
    }

    clearAuthMessage();
    setGoogleLoading(true);
    setAuthBusy('google');
    try {
      const completed = await openIntegrationPopup('google');
      if (!completed) {
        setAuthMessage('Google Calendar connection was cancelled.');
        return;
      }
      store.setGoogleConnected(true);
      setAuthMessage('Google Calendar connected.');
    } catch (err: unknown) {
      console.error('[Onboarding Google]', err);
      store.setGoogleConnected(false);
      setAuthMessage(err instanceof Error ? err.message : 'Google Calendar connection failed.');
    } finally {
      setAuthBusy(null);
      setGoogleLoading(false);
    }
  }, [clearAuthMessage, openIntegrationPopup, store]);

  const canContinue = useCallback((): boolean => {
    if (step === 2) return store.userName.trim().length > 0;
    if (step === 7) return store.focusGoals.length > 0;
    return true;
  }, [step, store.userName, store.focusGoals.length]);

  const goNext = useCallback(() => {
    if (!canContinue()) return;
    if (step === 8) {
      // Completion — save name + role to calendar profile, then mark done
      calStore.updateProfile({
        name: store.userName || calStore.profile.name,
        role: store.userRole || calStore.profile.role,
      });
      store.complete();
      router.replace('/');
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
            authEmail={authEmail}
            authPassword={authPassword}
            authBusy={authBusy}
            authMessage={authMessage ?? authSessionError?.message ?? null}
            onAuthEmailChange={setAuthEmail}
            onAuthPasswordChange={setAuthPassword}
            onSignUp={handleAuthSignUp}
            onSignIn={handleAuthSignIn}
            onGoogleSignIn={handleGoogleSignIn}
            onSignOut={handleAuthSignOut}
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
            onChange={store.setFocusSessionLength}
            onCustomChange={(f, b) => store.setFocusSessionLength('custom', f, b)}
          />
        );
      case 6:
        return (
          <StepCalendarSync
            googleConnected={store.googleConnected}
            microsoftConnected={store.microsoftConnected}
            googleLoading={googleLoading}
            outlookLoading={outlookLoading}
            onConnectGoogle={handleOnboardingGoogleConnect}
            onConnectMicrosoft={handleOnboardingMicrosoftConnect}
            onSkip={goNext}
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
        return <StepCompletion name={store.userName || calStore.profile.name} />;
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

          <button
            type="button"
            onClick={goNext}
            disabled={!canContinue()}
            className={cn(
              'flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors duration-150',
              canContinue()
                ? 'bg-primary text-white hover:bg-primary/90 cursor-pointer'
                : 'bg-muted text-muted-foreground/60 cursor-not-allowed opacity-60'
            )}
          >
            {isFirstStep ? 'Start Setup' : isLastStep ? 'Enter Workspace' : 'Continue'}
            {!isFirstStep && !isLastStep && (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingFlow;
