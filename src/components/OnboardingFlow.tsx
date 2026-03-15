'use client';

import React, { useState, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore, FocusPreference, FocusSessionLength, FocusGoal } from '../store/useOnboardingStore';
import { useCalendarStore } from '../store/useCalendarStore';
import { usePlannerStore } from '../store/usePlannerStore';
import { cn } from '../lib/utils';
import TimePicker from './TimePicker';
import { connectOutlook } from '../lib/outlook/outlookAuth';
import { syncOutlookCalendar } from '../services/outlookSyncService';
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
        ? 'border-primary/50 bg-primary/10 dark:bg-primary/8 text-primary'
        : 'border-border bg-background text-foreground hover:bg-muted/60 dark:hover:bg-muted/40 hover:border-border',
      className
    )}
  >
    <span
      className={cn(
        'flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-150',
        selected ? 'border-primary bg-primary' : 'border-gray-300 dark:border-border/60'
      )}
    >
      {selected && (
        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </span>
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
  <div className="space-y-7">
    <div className="space-y-1.5">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
    <div className="space-y-3">{children}</div>
  </div>
));
StepShell.displayName = 'StepShell';

/* ═══════════════════════════════════════════════════════════════════════════════
   STEP 0 — Welcome
══════════════════════════════════════════════════════════════════════════════ */
const StepWelcome = memo(() => (
  <div className="space-y-8">
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

    <div className="grid grid-cols-1 gap-2.5">
      {[
        { icon: '📊', text: 'Track your focus patterns' },
        { icon: '⏰', text: 'Suggest optimal work windows' },
        { icon: '⚡', text: 'Power your flow sessions' },
      ].map(({ icon, text }) => (
        <div key={text} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/50 dark:bg-muted/30 border border-border dark:border-border/40">
          <span className="text-base select-none">{icon}</span>
          <span className="text-sm text-foreground/70 dark:text-muted-foreground">{text}</span>
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
  authBusy: 'signup' | 'signin' | 'google' | 'signout' | null;
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
    <div className="rounded-2xl border border-border/80 bg-gradient-to-br from-background via-background to-muted/40 p-4 md:p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground/80">Account</p>
        <span className="text-xs text-muted-foreground">
          Session: {authStatus}
        </span>
      </div>

      {authStatus === 'logged in' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-3">
            <p className="text-xs text-muted-foreground mb-1">Connected account</p>
            <p className="text-sm font-medium text-foreground break-all">{authUserEmail ?? 'user'}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            disabled={Boolean(authBusy)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/60 disabled:opacity-60"
          >
            {authBusy === 'signout' ? 'Signing out...' : 'Sign Out'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2.5">
            <input
              type="email"
              name="onboarding-auth-email"
              value={authEmail}
              onChange={(e) => onAuthEmailChange(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-muted/40 border border-gray-200 dark:border-border/60 text-sm text-foreground outline-none focus:border-primary/50 dark:focus:border-primary/40"
            />
            <input
              type="password"
              name="onboarding-auth-password"
              value={authPassword}
              onChange={(e) => onAuthPasswordChange(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-muted/40 border border-gray-200 dark:border-border/60 text-sm text-foreground outline-none focus:border-primary/50 dark:focus:border-primary/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onSignUp}
              disabled={Boolean(authBusy) || !authEmail.trim() || !authPassword}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/60 disabled:opacity-60"
            >
              {authBusy === 'signup' ? 'Signing up...' : 'Sign Up'}
            </button>
            <button
              type="button"
              onClick={onSignIn}
              disabled={Boolean(authBusy) || !authEmail.trim() || !authPassword}
              className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/15 disabled:opacity-60"
            >
              {authBusy === 'signin' ? 'Signing in...' : 'Sign In'}
            </button>
          </div>

          <div className="relative py-1">
            <div className="h-px bg-border" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground bg-background">
              or
            </span>
          </div>

          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={Boolean(authBusy)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/60 disabled:opacity-60"
          >
            {authBusy === 'google' ? 'Redirecting to Google...' : 'Continue with Google'}
          </button>
        </div>
      )}

      {authMessage && (
        <p className="text-xs text-muted-foreground">{authMessage}</p>
      )}
    </div>
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Your name</label>
        <input
          type="text"
          autoFocus
          placeholder="e.g. Sarah Chen"
          value={name}
          onChange={(e) => onChange(e.target.value, role)}
          className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-muted/40 border border-gray-200 dark:border-border/60 text-sm text-foreground outline-none focus:border-primary/50 dark:focus:border-primary/40 placeholder:text-gray-400 dark:placeholder:text-muted-foreground/50 transition-colors duration-150"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Job title <span className="text-gray-400 dark:text-muted-foreground/40">(optional)</span>
        </label>
        <input
          type="text"
          placeholder="e.g. Product Designer"
          value={role}
          onChange={(e) => onChange(name, e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-muted/40 border border-gray-200 dark:border-border/60 text-sm text-foreground outline-none focus:border-primary/50 dark:focus:border-primary/40 placeholder:text-gray-400 dark:placeholder:text-muted-foreground/50 transition-colors duration-150"
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
══════════════════════════════════════════════════════════════════════════════ */
const StepCalendarSync = memo<{
  connected: 'outlook' | 'google' | null;
  onConnect: (provider: 'outlook' | 'google' | null) => void;
  outlookLoading?: boolean;
  onSkip: () => void;
}>(({ connected, onConnect, outlookLoading, onSkip }) => (
  <StepShell
    title="Sync your calendar"
    description="Lumina detects existing meetings and suggests optimal focus windows around them."
  >
    <div className="grid grid-cols-1 gap-3">
      <button
        type="button"
        onClick={() => onConnect(connected === 'outlook' ? null : 'outlook')}
        disabled={outlookLoading}
        className={cn(
          'flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-colors duration-150 text-left cursor-pointer',
          connected === 'outlook'
            ? 'border-blue-400 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/8'
            : 'border-border bg-background hover:bg-muted/60 dark:hover:bg-muted/40',
          outlookLoading && 'opacity-60 cursor-wait'
        )}
      >
        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.32.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V12z"/>
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            {outlookLoading ? 'Connecting...' : connected === 'outlook' ? 'Outlook Connected' : 'Connect Outlook'}
          </p>
          <p className="text-xs text-muted-foreground">Microsoft 365 / Outlook.com</p>
        </div>
        {connected === 'outlook' && (
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </button>

      <button
        type="button"
        onClick={() => onConnect(connected === 'google' ? null : 'google')}
        className={cn(
          'flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-colors duration-150 text-left cursor-pointer',
          connected === 'google'
            ? 'border-primary/50 bg-primary/10 dark:bg-primary/8'
            : 'border-border bg-background hover:bg-muted/60 dark:hover:bg-muted/40'
        )}
      >
        <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 flex items-center justify-center">
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#EA4335" d="M5.26620003,9.76452941 C6.19878754,6.93863203 8.85444915,4.90909091 12,4.90909091 C13.6909091,4.90909091 15.2181818,5.50909091 16.4181818,6.49090909 L19.9090909,3 C17.7818182,1.14545455 15.0545455,0 12,0 C7.27006974,0 3.1977497,2.69829785 1.23999023,6.65002441 L5.26620003,9.76452941 Z"/>
            <path fill="#34A853" d="M16.0407269,18.0125889 C14.9509167,18.7163016 13.5660892,19.0909091 12,19.0909091 C8.86648613,19.0909091 6.21911939,17.076871 5.27698177,14.2678769 L1.23746264,17.3349879 C3.19279051,21.2936293 7.26500293,24 12,24 C14.9328362,24 17.7353462,22.9573905 19.834192,20.9995801 L16.0407269,18.0125889 Z"/>
            <path fill="#4A90E2" d="M19.834192,20.9995801 C22.0291676,18.9520994 23.4545455,15.903663 23.4545455,12 C23.4545455,11.2909091 23.3454545,10.5818182 23.1818182,9.90909091 L12,9.90909091 L12,14.4545455 L18.4363636,14.4545455 C18.1187732,16.013626 17.2662994,17.2212117 16.0407269,18.0125889 L19.834192,20.9995801 Z"/>
            <path fill="#FBBC05" d="M5.27698177,14.2678769 C5.03832634,13.556323 4.90909091,12.7937589 4.90909091,12 C4.90909091,11.2182781 5.03443647,10.4668121 5.26620003,9.76452941 L1.23999023,6.65002441 C0.43658717,8.26043162 0,10.0753848 0,12 C0,13.9195484 0.444780743,15.7301709 1.23746264,17.3349879 L5.27698177,14.2678769 Z"/>
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Connect Google</p>
          <p className="text-xs text-muted-foreground">Google Calendar — coming soon</p>
        </div>
        {connected === 'google' && (
          <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
        )}
      </button>
    </div>

    <p className="text-xs text-gray-400 dark:text-muted-foreground/60 pt-1">
      {connected === 'outlook'
        ? 'Outlook calendar events will appear in your Lumina calendar.'
        : 'Connect your Outlook calendar to see meetings alongside your Lumina events.'}
    </p>

    <button
      type="button"
      onClick={onSkip}
      className="w-full text-center text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors py-1 cursor-pointer"
    >
      Skip — I don't use a calendar right now
    </button>
  </StepShell>
));
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
    <div className="space-y-3">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: [0.34, 1.2, 0.64, 1] }}
        className="w-12 h-12 rounded-xl border border-primary/30 bg-primary/10 dark:bg-primary/8 flex items-center justify-center"
      >
        <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </motion.div>

      <div className="space-y-1.5">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          You're ready{name ? `, ${name.split(' ')[0]}` : ''}.
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
          Lumina is now configured for your workflow.
          Your focus intelligence engine is active.
        </p>
      </div>
    </div>

    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col gap-2 text-xs text-gray-500 dark:text-muted-foreground/70 pt-2"
    >
      <div className="flex items-center gap-2">
        <div className="w-1 h-1 rounded-full bg-primary/50" />
        Focus schedule configured
      </div>
      <div className="flex items-center gap-2">
        <div className="w-1 h-1 rounded-full bg-primary/50" />
        Deep work engine ready
      </div>
      <div className="flex items-center gap-2">
        <div className="w-1 h-1 rounded-full bg-primary/50" />
        Intelligence insights active
      </div>
    </motion.div>
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
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authBusy, setAuthBusy] = useState<'signup' | 'signin' | 'google' | 'signout' | null>(null);
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
      const socialSignIn = (authClient.signIn as any)?.social;
      if (typeof socialSignIn !== 'function') {
        setAuthMessage('Google sign-in is unavailable in the current auth client.');
        return;
      }
      const result = await socialSignIn({
        provider: 'google',
        callbackURL: '/onboarding',
      });
      if (result?.error) {
        setAuthMessage(result.error.message ?? 'Google sign-in failed.');
      }
    } finally {
      setAuthBusy(null);
    }
  }, [authClient, clearAuthMessage]);

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

  const handleOutlookConnect = useCallback(async (provider: 'outlook' | 'google' | null) => {
    if (provider === 'google') {
      store.setCalendarConnected(store.calendarConnected === 'google' ? null : 'google');
      return;
    }
    if (provider === null) {
      store.setCalendarConnected(null);
      plannerStore.setOutlookConnected(false);
      return;
    }
    if (store.calendarConnected === 'outlook') {
      store.setCalendarConnected(null);
      plannerStore.setOutlookConnected(false);
      return;
    }
    setOutlookLoading(true);
    try {
      await connectOutlook();
      store.setCalendarConnected('outlook');
      plannerStore.setOutlookConnected(true);
      const events = await syncOutlookCalendar(calStore.timezone);
      plannerStore.setOutlookEvents(events);
    } catch (err: any) {
      console.error('[Onboarding Outlook]', err);
    } finally {
      setOutlookLoading(false);
    }
  }, [store, calStore]);

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
            connected={store.calendarConnected}
            onConnect={handleOutlookConnect}
            outlookLoading={outlookLoading}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      {/* Faint grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.06] dark:opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle, #6D59E0 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative w-full max-w-xl mx-auto px-6 flex flex-col gap-8">
        {/* Progress indicator */}
        <div className="flex items-center justify-between min-h-[20px]">
          {showProgress ? (
            <ProgressDots step={step - 1} total={7} />
          ) : (
            <div />
          )}
          {showProgress && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {step} / 7
            </span>
          )}
        </div>

        {/* Step content */}
        <div className="relative overflow-hidden min-h-[320px]">
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
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={goBack}
            disabled={isFirstStep}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer',
              isFirstStep
                ? 'opacity-0 pointer-events-none'
                : 'border border-gray-200 dark:border-border/60 bg-background text-gray-600 dark:text-muted-foreground hover:text-foreground hover:bg-gray-50 dark:hover:bg-muted/50'
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
                ? 'bg-primary  text-white hover:bg-primary/90 cursor-pointer'
                : 'bg-gray-200 dark:bg-muted text-white  cursor-not-allowed opacity-60'
            )}
          >
            {isFirstStep ? 'Start Setup' : isLastStep ? 'Enter Workspace →' : 'Continue'}
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
