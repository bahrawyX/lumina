'use client';

import React, { useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useNotificationStore, type NotificationPreferences } from '@/store/useNotificationStore';

/* ─── Toggle Row ────────────────────────────────────────────────────────────── */

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-[11px] leading-tight text-muted-foreground mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted',
          disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          ].join(' ')}
        />
      </button>
    </div>
  );
}

/* ─── Permission Banner ─────────────────────────────────────────────────────── */

function PermissionBanner() {
  const { permission, isSupported, requestPermission } = useNotificationStore();

  if (!isSupported) {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/30 px-3.5 py-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Notifications not supported</p>
        <p className="text-[11px] mt-0.5">
          Your browser does not support push notifications. Try using Chrome, Edge, or Safari 16+.
        </p>
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm">
        <div className="flex items-center gap-2">
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-destructive flex-shrink-0">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="font-medium text-foreground">Notifications blocked</p>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          You&apos;ve blocked notifications for this site. To re-enable, open your browser settings
          and allow notifications for this domain.
        </p>
      </div>
    );
  }

  if (permission === 'granted') {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-3 text-sm">
        <div className="flex items-center gap-2">
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-primary flex-shrink-0">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <p className="font-medium text-foreground">Notifications enabled</p>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          You&apos;ll receive push notifications even when Lumina is closed.
        </p>
      </div>
    );
  }

  // Default state — prompt to enable
  return (
    <div className="rounded-xl border border-border/60 bg-card px-3.5 py-3.5">
      <p className="text-sm font-medium text-foreground">Enable push notifications</p>
      <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">
        Get reminders for events, streaks, and your daily brief — even when Lumina is closed.
      </p>
      <Button
        size="sm"
        onClick={() => void requestPermission()}
        className="w-full"
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        Allow Notifications
      </Button>
    </div>
  );
}

/* ─── Notification Types Config ──────────────────────────────────────────── */

const NOTIFICATION_TYPES: {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
}[] = [
  {
    key: 'dailyBrief',
    label: 'Daily Brief',
    description: 'Morning summary with today\'s events and tasks at 8 AM',
  },
  {
    key: 'eventReminders',
    label: 'Event Reminders',
    description: '10-minute heads-up before calendar events',
  },
  {
    key: 'streakReminder',
    label: 'Streak Reminder',
    description: 'Evening nudge when your focus streak is at risk',
  },
  {
    key: 'taskReminders',
    label: 'Task Reminders',
    description: 'Alerts for tasks due today alongside your daily brief',
  },
  {
    key: 'focusComplete',
    label: 'Focus Complete',
    description: 'Notification when a focus session finishes (background tab)',
  },
];

/* ─── Main Component ─────────────────────────────────────────────────────── */

interface NotificationSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function NotificationSettings({ open, onOpenChange }: NotificationSettingsProps) {
  const { permission, preferences, subscription, init, updatePreferences } =
    useNotificationStore();

  // Initialize notification store when sheet opens
  useEffect(() => {
    if (open) {
      void init();
    }
  }, [open, init]);

  const togglesDisabled = permission !== 'granted';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:w-[380px] sm:max-w-[380px] flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-0">
          <SheetTitle className="font-display text-xl">Notifications</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Manage push notification preferences
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Permission state */}
          <PermissionBanner />

          {/* Notification toggles */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-1">
              Notification Types
            </p>
            <div className="space-y-1.5">
              {NOTIFICATION_TYPES.map(({ key, label, description }) => (
                <ToggleRow
                  key={key}
                  label={label}
                  description={description}
                  checked={preferences[key]}
                  disabled={togglesDisabled}
                  onChange={(v) => void updatePreferences({ [key]: v })}
                />
              ))}
            </div>
          </div>

          {/* Device Info */}
          {permission === 'granted' && subscription && (
            <div className="rounded-xl border border-border/40 bg-muted/20 px-3.5 py-3 space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Device
              </p>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-xs text-foreground">
                  This device is registered for push notifications
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono truncate">
                {subscription.endpoint?.slice(0, 60)}...
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
