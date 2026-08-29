'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { CATEGORIES } from '../constants';
import { useCalendarStore } from '../store/useCalendarStore';
import { usePlannerStore } from '../store/usePlannerStore';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTaskBoardStore } from '../store/useTaskBoardStore';
import { clearProvider, clearAll } from '../lib/calendar/externalEventsCache';
import { focusModeFromMinutes } from '../lib/focusSettings';
import CustomContextDialog from './CustomContextDialog';
import { SidebarContexts } from './sidebar/SidebarContexts';
import {
  PlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LightbulbIcon as InsightsIcon,
  MonthIcon as LayoutGridIcon,
  TargetIcon as BarChart3Icon,
  TimerIcon,
  CloseIcon as SquareIcon,
  ClockIcon,
  SettingsIcon,
  ExternalLinkIcon,
  GoogleProviderIcon,
  OutlookProviderIcon,
} from './icons';
import { useLuminaAuthClient } from './AuthProvider';
import {
  useIntegrationConnect,
  type IntegrationProvider,
} from '@/hooks/useIntegrationConnect';
import { logger } from '@/lib/logger';
import { useTutorialStore } from '../store/useTutorialStore';
import { useDocsStore } from '../store/useDocsStore';
import { useQuickCaptureStore } from '../store/useQuickCaptureStore';
import type { DocTreeNode } from '@/types/doc';
import { useAmbientStore } from '../store/useAmbientStore';
import { useGoalsStore, selectActiveGoalCount } from '../store/useGoalsStore';
import { useCoinsStore, selectCoinBalance } from '../store/useCoinsStore';
import ContactDrawer from './contact/ContactDrawer';
import NotificationSettings from './settings/NotificationSettings';
import AccountDataSheet from './settings/AccountDataSheet';
import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from './ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { toast } from 'sonner';
import notify from '../utils/notify';
import { signOutEverywhere } from '@/lib/auth/signOut';
import { dedupedGetJson } from '@/lib/persistence/apiClient';

const MoreIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
  </svg>
);

const EditIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
  </svg>
);

const TrashIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
);

/* ─── Inline icons ─────────────────────────────────────────────────────────── */
const KanbanIcon: React.FC<{ size?: number; strokeWidth?: number; className?: string }> = ({ size = 16, strokeWidth = 1.5, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="3" width="5" height="18" rx="1" />
    <rect x="10" y="3" width="5" height="12" rx="1" />
    <rect x="17" y="3" width="5" height="8" rx="1" />
  </svg>
);

const GoalsIcon: React.FC<{ size?: number; strokeWidth?: number; className?: string }> = ({ size = 16, strokeWidth = 1.5, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

const ShopIcon: React.FC<{ size?: number; strokeWidth?: number; className?: string }> = ({ size = 16, strokeWidth = 1.5, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" /><path d="M12 6v12M8 10h8M8 14h8" />
  </svg>
);

const UserIcon: React.FC<{ size?: number; className?: string }> = ({ size = 15, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);

const LogOutIcon: React.FC<{ size?: number; className?: string }> = ({ size = 15, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const PomodoroIcon: React.FC<{ size?: number; strokeWidth?: number; className?: string }> = ({ size = 16, strokeWidth = 1.5, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2" /><path d="M9 2h6" /><path d="M12 2v2" />
  </svg>
);

const DocsIcon: React.FC<{ size?: number; strokeWidth?: number; className?: string }> = ({ size = 16, strokeWidth = 1.5, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);

const PlanDayIcon: React.FC<{ size?: number; strokeWidth?: number; className?: string }> = ({ size = 16, strokeWidth = 1.5, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="14" x2="12" y2="14" /><line x1="8" y1="18" x2="16" y2="18" />
  </svg>
);

interface ExternalCalendarFilter {
  id: string;
  provider: 'google' | 'microsoft';
  name: string;
  color: string;
  enabled: boolean;
}

/**
 * Write the server's integration truth into the onboarding store.
 *
 * P3-9: this fact lived in three places — the sidebar's local state,
 * `usePlannerStore`, and `useOnboardingStore` — and the disconnect path wrote
 * only the first two.
 *
 * Read imperatively rather than subscribed, so `refreshIntegrationStatus`
 * keeps a stable callback identity: it is a dependency of the OAuth poll loop,
 * and re-creating it on every status change would restart the poll.
 */
function syncOnboardingIntegrationFlags(google: boolean, microsoft: boolean): void {
  const store = useOnboardingStore.getState();
  if (store.googleConnected !== google) store.setGoogleConnected(google);
  if (store.microsoftConnected !== microsoft) store.setMicrosoftConnected(microsoft);
}

const AppSidebar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const authClient = useLuminaAuthClient();
  const { data: _session } = authClient.useSession();
  const _userId = _session?.user?.id ?? null;
  const handleSignOut = useCallback(async () => {
    // F7.1: `signOut()` used to be fire-and-forget, immediately followed by
    // `window.location.href = '/'`. Unloading the document cancels in-flight
    // fetches, so the request could be aborted before reaching the server —
    // leaving the `sessions` row alive and the cookie uncleared while the UI
    // looked signed out. The next person to complete onboarding on that device
    // landed in the PREVIOUS account's data.
    //
    // The race the old comment worried about (AppShell's redirect effect
    // winning) is handled by the hard navigation itself, which
    // `signOutEverywhere` performs last.
    try {
      if (_userId) clearAll(_userId);
      usePlannerStore.getState().clearExternalEvents();
    } catch { /* swallow */ }

    await signOutEverywhere({ redirectTo: '/' });
  }, [_userId]);
  const startTutorial = useTutorialStore((s) => s.startTutorial);
  const focusSessionLength = useSettingsStore((s) => s.focusSessionLength);
  const tasks = useTaskBoardStore((s) => s.tasks);
  // Per-field selectors — a full-store destructure would re-render the
  // sidebar on every state change (pathname, date, view, etc.) and show
  // up as perceived lag when the user navigates routes.
  const openModal           = useCalendarStore((s) => s.openModal);
  const activeFilters       = useCalendarStore((s) => s.activeFilters);
  const toggleFilter        = useCalendarStore((s) => s.toggleFilter);
  const clearFilters        = useCalendarStore((s) => s.clearFilters);
  const profile             = useCalendarStore((s) => s.profile);
  const insights            = useCalendarStore((s) => s.insights);
  const activeFocusSession  = useCalendarStore((s) => s.activeFocusSession);
  const startFocusSession   = useCalendarStore((s) => s.startFocusSession);
  const cancelFocusSession  = useCalendarStore((s) => s.cancelFocusSession);
  const isSidebarCollapsed  = useCalendarStore((s) => s.isSidebarCollapsed);
  const setSidebarCollapsed = useCalendarStore((s) => s.setSidebarCollapsed);
  const customCategories    = useCalendarStore((s) => s.customCategories);
  const addCustomCategory   = useCalendarStore((s) => s.addCustomCategory);
  const updateContext       = useCalendarStore((s) => s.updateContext);
  const deleteContext       = useCalendarStore((s) => s.deleteContext);
  const outlookConnected    = usePlannerStore((s) => s.outlookConnected);
  const setOutlookConnected = usePlannerStore((s) => s.setOutlookConnected);
  const setGoogleConnected  = usePlannerStore((s) => s.setGoogleConnected);
  const setOutlookEvents    = usePlannerStore((s) => s.setOutlookEvents);
  const setGoogleEvents     = usePlannerStore((s) => s.setGoogleEvents);
  const clearExternalEvents = usePlannerStore((s) => s.clearExternalEvents);
  const googleEvents        = usePlannerStore((s) => s.googleEvents);

  const [outlookLoading, setOutlookLoading] = React.useState(false);
  const [customContextDialogOpen, setCustomContextDialogOpen] = useState(false);
  const [contactDrawerOpen, setContactDrawerOpen] = useState(false);
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false);
  // P2-14: export + delete. Reachable from the account menu, because a right
  // the user cannot find is not a right they have.
  const [accountDataOpen, setAccountDataOpen] = useState(false);
  const [editingContextName, setEditingContextName] = useState<string | null>(null);
  const [contextPendingDelete, setContextPendingDelete] = useState<string | null>(null);

  // Suppress tooltips during collapse transition to prevent flash
  const [tooltipsReady, setTooltipsReady] = useState(isSidebarCollapsed);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    if (isSidebarCollapsed) {
      // Delay enabling tooltips until collapse animation finishes
      collapseTimerRef.current = setTimeout(() => setTooltipsReady(true), 350);
    } else {
      setTooltipsReady(false);
    }
    return () => { if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current); };
  }, [isSidebarCollapsed]);

  const isCalendarPage = pathname === '/calendar';
  const isIntelligencePage = pathname === '/intelligence';
  const isTasksPage = pathname === '/tasks';
  const isGoalsPage = pathname === '/goals';
  const activeGoalCount = useGoalsStore(selectActiveGoalCount);
  const coinBalance = useCoinsStore(selectCoinBalance);
  const isPlanPage = pathname === '/plan';
  const isDocsPage = pathname === '/docs' || pathname.startsWith('/docs/');
  const [docsTreeOpen, setDocsTreeOpen] = useState(false);
  const sidebarDocs = useDocsStore((s) => s.docs);
  const docsHydrated = useDocsStore((s) => s.dbHydrated);

  const allCategories = [...CATEGORIES, ...customCategories];
  const tasksUsingPendingContext = contextPendingDelete
    ? tasks.filter((task) => task.context === contextPendingDelete).length
    : 0;
  const editingContext = editingContextName
    ? customCategories.find((category) => category.name === editingContextName) ?? null
    : null;

  // F4.5–F4.8 / P3-9: ~140 lines lived here — a third copy of the OAuth popup
  // promise, a failure-message switch, and a blocked-context heuristic that
  // reported an ordinary Cancel as a browser fault. All of it is
  // `useIntegrationConnect` now.

  const [googleCalLoading, setGoogleCalLoading] = React.useState(false);
  const [googleCalConnected, setGoogleCalConnected] = React.useState(false);
  const [calendarFiltersOpen, setCalendarFiltersOpen] = React.useState(false);
  const [calendarFiltersLoading, setCalendarFiltersLoading] = React.useState(false);
  const [calendarFilters, setCalendarFilters] = React.useState<ExternalCalendarFilter[]>([]);
  const [savingCalendarId, setSavingCalendarId] = React.useState<string | null>(null);

  const refreshIntegrationStatus = React.useCallback(async (forceRefresh = false) => {
    try {
      // P1-15: this and `PersistenceBootstrap` both fetch this endpoint on the
      // same page load. `force` is passed by the callers that need a fresh read
      // (right after an OAuth connect completes), so the dedupe window never
      // makes the "Connected" badge stale.
      const result = await dedupedGetJson<{
        google?: { connected: boolean };
        microsoft?: { connected: boolean };
      }>('/api/integrations/status', { force: forceRefresh });

      if (result.kind === 'error') {
        setGoogleCalConnected(false);
        setGoogleConnected(false);
        setOutlookConnected(false);
        syncOnboardingIntegrationFlags(false, false);
        setOutlookEvents([]);
        return { google: false, microsoft: false };
      }

      const data = result.data;

      const isGoogleConnected = Boolean(data.google?.connected);
      const isMicrosoftConnected = Boolean(data.microsoft?.connected);

      setGoogleCalConnected(isGoogleConnected);
      setGoogleConnected(isGoogleConnected);
      setOutlookConnected(isMicrosoftConnected);
      // P3-9: the same fact lived in THREE places — this component's local
      // state, `usePlannerStore`, and `useOnboardingStore` — and only the first
      // two were written here. Disconnecting Google from the sidebar left
      // `useOnboardingStore.googleConnected === true`, persisted to
      // localStorage, so the onboarding flow's "Connected" badge was stale
      // until the value was un-persisted. The server response now reconciles
      // all three.
      syncOnboardingIntegrationFlags(isGoogleConnected, isMicrosoftConnected);

      if (!isMicrosoftConnected) {
        setOutlookEvents([]);
      }

      return { google: isGoogleConnected, microsoft: isMicrosoftConnected };
    } catch {
      setGoogleCalConnected(false);
      setGoogleConnected(false);
      setOutlookConnected(false);
      setOutlookEvents([]);
      return { google: false, microsoft: false };
    }
  }, [setGoogleConnected, setOutlookConnected, setOutlookEvents]);

  const loadCalendarFilters = React.useCallback(async () => {
    setCalendarFiltersLoading(true);
    try {
      const res = await fetch('/api/integrations/calendars', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Calendar list failed (${res.status})`);
      }

      const data = (await res.json()) as { calendars?: ExternalCalendarFilter[] };
      const rows = Array.isArray(data.calendars) ? data.calendars : [];
      setCalendarFilters(rows);
    } catch (err) {
      console.error('[Sidebar calendar filters]', err);
      toast.error('Could not load calendar filters.', { duration: 3_500 });
    } finally {
      setCalendarFiltersLoading(false);
    }
  }, []);

  const openCalendarFiltersDialog = React.useCallback(() => {
    setCalendarFiltersOpen(true);
    void loadCalendarFilters();
  }, [loadCalendarFilters]);

  const toggleCalendarFilter = React.useCallback(
    async (calendar: ExternalCalendarFilter) => {
      const nextEnabled = !calendar.enabled;
      setSavingCalendarId(calendar.id);
      setCalendarFilters((prev) =>
        prev.map((row) =>
          row.id === calendar.id ? { ...row, enabled: nextEnabled } : row,
        ),
      );

      try {
        const res = await fetch(`/api/integrations/calendars/${calendar.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: nextEnabled }),
        });

        if (!res.ok) {
          throw new Error(`Calendar update failed (${res.status})`);
        }

        if (_userId) {
          clearProvider(_userId, calendar.provider);
        }

        if (calendar.provider === 'google') {
          setGoogleEvents([]);
        } else {
          setOutlookEvents([]);
        }

        window.dispatchEvent(new Event('lumina:external-sync-now'));
      } catch (err) {
        console.error('[Sidebar toggle calendar filter]', err);
        toast.error('Could not update this calendar filter. Reverting.', { duration: 3_500 });
        await loadCalendarFilters();
      } finally {
        setSavingCalendarId(null);
      }
    },
    [_userId, loadCalendarFilters, setGoogleEvents, setOutlookEvents],
  );

  const isIntegrationConnected = React.useCallback(
    async (provider: IntegrationProvider) => {
      const status = await refreshIntegrationStatus(true);
      return provider === 'google' ? status.google : status.microsoft;
    },
    [refreshIntegrationStatus],
  );

  const connectIntegration = useIntegrationConnect({ isConnected: isIntegrationConnected });

  const handleOutlookConnect = React.useCallback(async () => {
    if (outlookConnected) {
      const disconnectToastId = 'outlook-disconnect-loading';
      toast.loading('Disconnecting Outlook Calendar...', { id: disconnectToastId });
      try {
        const response = await fetch('/api/integrations/microsoft/disconnect', { method: 'POST' });
        if (!response.ok) {
          throw new Error(`Disconnect failed (${response.status})`);
        }

        // Clear provider-specific browser cache and in-memory events
        if (_userId) clearProvider(_userId, 'microsoft');
        setOutlookEvents([]);
        await refreshIntegrationStatus(true);
        toast.success('Outlook Calendar disconnected.', { id: disconnectToastId, duration: 2_500 });
      } catch (err) {
        console.error('[Sidebar Outlook disconnect]', err);
        await refreshIntegrationStatus(true);
        toast.error('Failed to disconnect Outlook Calendar.', { id: disconnectToastId, duration: 4_000 });
      }
      return;
    }

    setOutlookLoading(true);
    try {
      const result = await connectIntegration('microsoft');

      if (result.kind === 'error') {
        await refreshIntegrationStatus(true);
        notify(result.message);
        return;
      }

      window.dispatchEvent(new Event('lumina:external-sync-now'));
    } catch (err) {
      await refreshIntegrationStatus(true);
      logger.error('outlook connect failed', { component: 'Sidebar' }, err);
      notify("We couldn't finish connecting Outlook. Please try again.");
    } finally {
      setOutlookLoading(false);
    }
  }, [connectIntegration, outlookConnected, refreshIntegrationStatus]);

  React.useEffect(() => {
    // Deduped: PersistenceBootstrap requests the same endpoint in the same
    // commit. Post-mutation refreshes elsewhere pass `true` to bypass it.
    void refreshIntegrationStatus();
  }, [refreshIntegrationStatus]);

  const handleGoogleCalendarConnect = React.useCallback(async () => {
    if (googleCalConnected) {
      const disconnectToastId = 'google-disconnect-loading';
      toast.loading('Disconnecting Google Calendar...', { id: disconnectToastId });
      try {
        const response = await fetch('/api/integrations/google/disconnect', { method: 'POST' });
        if (!response.ok) {
          throw new Error(`Disconnect failed (${response.status})`);
        }

        // Clear provider-specific browser cache and in-memory events
        if (_userId) clearProvider(_userId, 'google');
        setGoogleEvents([]);
        await refreshIntegrationStatus();
        toast.success('Google Calendar disconnected.', { id: disconnectToastId, duration: 2_500 });
      } catch (err) {
        console.error('[Sidebar Google disconnect]', err);
        await refreshIntegrationStatus();
        toast.error('Failed to disconnect Google Calendar.', { id: disconnectToastId, duration: 4_000 });
      }
      return;
    }

    setGoogleCalLoading(true);
    try {
      const result = await connectIntegration('google');

      if (result.kind === 'error') {
        await refreshIntegrationStatus();
        notify(result.message);
        return;
      }

      window.dispatchEvent(new Event('lumina:external-sync-now'));
    } catch (err) {
      await refreshIntegrationStatus();
      logger.error('google connect failed', { component: 'Sidebar' }, err);
      notify("We couldn't finish connecting Google Calendar. Please try again.");
    } finally {
      setGoogleCalLoading(false);
    }
  }, [
    connectIntegration,
    googleCalConnected,
    refreshIntegrationStatus,
    setGoogleEvents,
  ]);
  /* Elapsed time for active focus session */
  const [elapsed, setElapsed] = React.useState('00:00');
  React.useEffect(() => {
    if (!activeFocusSession) {
      setElapsed('00:00');
      return;
    }
    const tick = () => {
      const sec = Math.floor(
        (Date.now() - new Date(activeFocusSession.startedAt).getTime()) / 1000
      );
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      setElapsed(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeFocusSession?.id, activeFocusSession?.startedAt]);

  const handleDeleteContext = React.useCallback((contextName: string) => {
    const taskCount = tasks.filter((task) => task.context === contextName).length;
    if (taskCount === 0) {
      deleteContext(contextName);
      return;
    }
    setContextPendingDelete(contextName);
  }, [tasks, deleteContext]);

  const confirmDeleteContext = React.useCallback(() => {
    if (!contextPendingDelete) return;
    deleteContext(contextPendingDelete);
    setContextPendingDelete(null);
  }, [contextPendingDelete, deleteContext]);

  return (
    <motion.aside
      initial={false}
      animate={isSidebarCollapsed ? 'collapsed' : 'expanded'}
      variants={{
        expanded: { width: '288px' },
        collapsed: { width: '72px' },
      }}
      transition={{ type: 'spring', damping: 28, stiffness: 220 }}
      // Visibility is controlled by the parent wrapper in AppShell — desktop
      // shows it inside `hidden md:flex`, mobile shows it inside the drawer.
      // Width is animated by the variants above (288px expanded / 72px
      // collapsed). The inner Sidebar must NOT be its own visibility gate or
      // it would never render in the mobile drawer overlay.
      // `overflow-visible`, not `overflow-hidden`. The collapse toggle below is
      // deliberately positioned at `-right-3` so it straddles the border, and
      // clipping it here cut the button in half — the sidebar's own edge sliced
      // straight through it. The width animation still needs clipping, so that
      // moved onto the inner wrapper, which is what actually holds the content
      // that would otherwise spill during the transition.
      className="relative flex flex-col h-full bg-background border-r border-border/60 z-40 overflow-visible"
    >
      {/* Collapse toggle */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setSidebarCollapsed(!isSidebarCollapsed)}
        aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-12 h-6 w-6 min-h-6 min-w-6 p-0 rounded-full border border-border/80 bg-background shadow-sm z-50 hover:bg-accent/50 transition-colors flex items-center justify-center"
      >
        {isSidebarCollapsed ? (
          <ChevronRightIcon size={12} className="flex-shrink-0" />
        ) : (
          <ChevronLeftIcon size={12} className="flex-shrink-0" />
        )}
      </Button>

      <Sidebar className="h-full overflow-hidden">
        {/* ── Header ────────────────────────────────────────────── */}
        <SidebarHeader className="px-4 pt-8 pb-4 gap-4">
          {/* Logo row */}
          {isSidebarCollapsed ? (
            <div className="flex justify-center">
              <span className="font-logo text-xl font-semibold text-primary dark:text-foreground select-none">L</span>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-end justify-between overflow-hidden"
            >
              {/* Wordmark */}
              <div className="flex flex-col leading-none">
                <span className="font-logo text-[24px] font-medium tracking-[-0.035em] text-foreground leading-none">
                  Lumina
                </span>
                <span className="font-sans text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 leading-none mt-1.5">
                  Focused Craft
                </span>
              </div>

              {/* Streak badge — editorial treatment with measured type */}
              <div className="flex items-baseline gap-1 pb-0.5">
                <span className="font-display text-[26px] font-medium text-foreground leading-none tabular-nums">
                  {profile.intelligence.focusStreak}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground leading-none">
                  d · streak
                </span>
              </div>
            </motion.div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-1.5">
            {/* New Entry */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    router.push('/calendar');
                    openModal();
                  }}
                  data-tutorial="new-entry"
                  className={`w-full flex items-center gap-2.5 h-9 rounded-xl bg-muted/50 hover:bg-muted border border-border/50 text-foreground transition-colors duration-150 ease-out text-sm font-medium font-sans ${isSidebarCollapsed ? 'justify-center px-0' : 'px-3'
                    }`}
                >
                  <PlusIcon size={15} strokeWidth={1.5} className="text-muted-foreground" />
                  {!isSidebarCollapsed && <span>New Entry</span>}
                </button>
              </TooltipTrigger>
              {tooltipsReady && <TooltipContent side="right">New Entry</TooltipContent>}
            </Tooltip>

            {/* Ignite Flow / running session */}
            {activeFocusSession ? (
              <div
                className={`w-full flex items-center gap-2.5 h-9 rounded-xl border border-border/60 bg-muted/40 px-3 ${isSidebarCollapsed ? 'justify-center px-0' : ''
                  }`}
              >
                {!isSidebarCollapsed && (
                  <>
                    <ClockIcon size={13} strokeWidth={1.5} className="text-primary flex-shrink-0" />
                    <span className="font-mono text-xs font-semibold text-primary tabular-nums flex-1">
                      {elapsed}
                    </span>
                  </>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={cancelFocusSession}
                      className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                    >
                      <SquareIcon size={12} strokeWidth={1.5} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Cancel session</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      router.push('/pomodoro');
                    }}
                    data-tutorial="ignite-flow"
                    className={`w-full flex items-center gap-2.5 h-9 rounded-xl bg-transparent hover:bg-muted/60 border border-border/50 text-muted-foreground hover:text-foreground transition-colors duration-150 ease-out text-sm font-medium font-sans ${isSidebarCollapsed ? 'justify-center px-0' : 'px-3'
                      }`}
                  >
                    <TimerIcon size={14} strokeWidth={1.5} />
                    {!isSidebarCollapsed && <span>Start Focus</span>}
                  </button>
                </TooltipTrigger>
                {tooltipsReady && <TooltipContent side="right">Start Focus</TooltipContent>}
              </Tooltip>
            )}

            {/* Quick Capture — same trigger as the Q hotkey */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => useQuickCaptureStore.getState().open()}
                  aria-label="Quick capture (Q)"
                  className={`w-full flex items-center gap-2.5 h-9 rounded-xl bg-transparent hover:bg-muted/60 border border-border/50 text-muted-foreground hover:text-foreground transition-colors duration-150 ease-out text-sm font-medium font-sans ${isSidebarCollapsed ? 'justify-center px-0' : 'px-3'
                    }`}
                >
                  <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                    <circle cx="7" cy="7" r="6" />
                    <line x1="7" y1="4" x2="7" y2="10" />
                    <line x1="4" y1="7" x2="10" y2="7" />
                  </svg>
                  {!isSidebarCollapsed && (
                    <>
                      <span>Quick capture</span>
                      <kbd className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground/60">
                        {typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘K' : 'Ctrl K'}
                      </kbd>
                    </>
                  )}
                </button>
              </TooltipTrigger>
              {tooltipsReady && <TooltipContent side="right">Quick capture (Q)</TooltipContent>}
            </Tooltip>
          </div>
        </SidebarHeader>

        <SidebarSeparator />

        {/* ── Content ────────────────────────────────────────────── */}
        {/* `thin-scrollbar`, not `no-scrollbar`. The nav scrolls, and hiding
            the scrollbar meant nothing on screen said so — the list simply
            looked like it ended at the last visible item, with Ambient
            Sounds, Notifications and Contact invisible below the fold.
            The bar is themed from `--muted-foreground`, so showing it no
            longer means showing an OS-grey bar in a dark sidebar. */}
        <SidebarContent className="px-2 py-3 gap-1 thin-scrollbar">
          {/* Insights */}
          {!isSidebarCollapsed && insights.length > 0 && (
            <SidebarGroup className="px-2 mb-2">
              <SidebarGroupLabel className="flex items-center gap-2 px-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/50">
                <InsightsIcon size={10} className="text-primary/50" />
                Insights
              </SidebarGroupLabel>
              <SidebarGroupContent className="space-y-2 mt-1">
                {insights.map((insight) => (
                  <div
                    key={insight.id}
                    className="p-3 rounded-xl bg-muted/40 border border-border/50 cursor-pointer hover:bg-muted/70 transition-colors duration-150"
                  >
                    <p className="text-[11px] font-medium leading-relaxed text-foreground/60 font-sans">
                      {insight.message}
                    </p>
                  </div>
                ))}
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* Workspace nav */}
          <SidebarGroup className="px-2">
            {!isSidebarCollapsed && (
              <SidebarGroupLabel className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/50 px-3 mb-1">
                Workspace
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                <WorkspaceItem
                  icon={LayoutGridIcon}
                  label="Calendar"
                  isActive={isCalendarPage}
                  collapsed={isSidebarCollapsed}
                  showTooltip={tooltipsReady}
                  href="/calendar"
                  onClick={() => router.push('/calendar')}
                  dataTutorial="nav-calendar"
                />
                <WorkspaceItem
                  icon={PomodoroIcon}
                  label="Pomodoro"
                  isActive={pathname === '/pomodoro'}
                  collapsed={isSidebarCollapsed}
                  showTooltip={tooltipsReady}
                  href="/pomodoro"
                  onClick={() => router.push('/pomodoro')}
                  dataTutorial="nav-pomodoro"
                />
                <WorkspaceItem
                  icon={InsightsIcon}
                  label="Insights"
                  isActive={isIntelligencePage}
                  collapsed={isSidebarCollapsed}
                  showTooltip={tooltipsReady}
                  href="/intelligence"
                  onClick={() => router.push('/intelligence')}
                  dataTutorial="nav-intelligence"
                />
                <WorkspaceItem
                  icon={KanbanIcon}
                  label="Tasks"
                  isActive={isTasksPage}
                  collapsed={isSidebarCollapsed}
                  showTooltip={tooltipsReady}
                  href="/tasks"
                  onClick={() => router.push('/tasks')}
                  dataTutorial="nav-tasks"
                />
                <WorkspaceItem
                  icon={GoalsIcon}
                  label="Goals"
                  isActive={isGoalsPage}
                  collapsed={isSidebarCollapsed}
                  showTooltip={tooltipsReady}
                  href="/goals"
                  onClick={() => router.push('/goals')}
                  dataTutorial="nav-goals"
                  badge={activeGoalCount}
                />
                <WorkspaceItem
                  icon={PlanDayIcon}
                  label="Plan Day"
                  isActive={isPlanPage}
                  collapsed={isSidebarCollapsed}
                  showTooltip={tooltipsReady}
                  href="/plan"
                  onClick={() => router.push('/plan')}
                  dataTutorial="nav-plan"
                />
                <WorkspaceItem
                  icon={BarChart3Icon}
                  label="Performance"
                  isActive={pathname === '/performance'}
                  collapsed={isSidebarCollapsed}
                  showTooltip={tooltipsReady}
                  href="/performance"
                  onClick={() => router.push('/performance')}
                  dataTutorial="nav-performance"
                />
                <WorkspaceItem
                  icon={ShopIcon}
                  label="Shop"
                  isActive={pathname === '/shop'}
                  collapsed={isSidebarCollapsed}
                  showTooltip={tooltipsReady}
                  href="/shop"
                  onClick={() => router.push('/shop')}
                  dataTutorial="nav-shop"
                  badge={coinBalance}
                />
                {/* Docs — with inline collapsible tree */}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isDocsPage}
                    onClick={() => router.push('/docs')}
                    className="group/workspace relative hover:bg-transparent dark:hover:bg-transparent"
                    data-tutorial="nav-docs"
                  >
                    <Link href="/docs" prefetch className="absolute inset-0 pointer-events-none" aria-hidden tabIndex={-1} />
                    <NavItemIndicator active={isDocsPage} />
                    <DocsIcon
                      size={16}
                      strokeWidth={1.5}
                      className={`relative z-10 flex-shrink-0 transition-colors ${isDocsPage ? 'text-foreground' : 'text-muted-foreground group-hover/workspace:text-foreground'}`}
                    />
                    {!isSidebarCollapsed && (
                      <span className="relative z-10 font-sans text-sm truncate flex-1">Docs</span>
                    )}
                    {!isSidebarCollapsed && docsHydrated && sidebarDocs.filter(d => !d.isArchived).length > 0 && (
                      // Span (not button) — this lives inside SidebarMenuButton which
                      // already renders a <button>; nesting button-in-button is invalid
                      // HTML and trips React's hydration validator.
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={docsTreeOpen ? 'Collapse docs tree' : 'Expand docs tree'}
                        aria-expanded={docsTreeOpen}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDocsTreeOpen(!docsTreeOpen); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            setDocsTreeOpen(!docsTreeOpen);
                          }
                        }}
                        className="relative z-10 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60 transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <motion.svg
                          width={10}
                          height={10}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          animate={{ rotate: docsTreeOpen ? 90 : 0 }}
                          transition={{ duration: 0.12 }}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </motion.svg>
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {/* Inline docs file tree */}
                {!isSidebarCollapsed && docsTreeOpen && docsHydrated && (
                  <SidebarDocsInlineTree docs={sidebarDocs} />
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Contexts — one row that opens the full set, rather than one row
              per context. See `SidebarContexts` for why. */}
          <SidebarGroup className="px-2 mt-1">
            <SidebarGroupContent>
              <SidebarContexts
                allCategories={allCategories}
                customCategories={customCategories}
                activeFilters={activeFilters}
                collapsed={isSidebarCollapsed}
                onToggleFilter={(name) => toggleFilter(name as Parameters<typeof toggleFilter>[0])}
                onClearFilters={clearFilters}
                onAddContext={() => setCustomContextDialogOpen(true)}
                onEditContext={(name) => setEditingContextName(name)}
                onDeleteContext={handleDeleteContext}
              />
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Goals widget — keeps active goals visible during daily work */}
          <SidebarGoalsWidget collapsed={isSidebarCollapsed} />
        </SidebarContent>

        {/* ── Utility actions ───────────────────────────────────── */}
        {/* The rule sits ABOVE this group, not below it. Below, it read as the
            top edge of the profile footer and left Ambient Sounds /
            Notifications / Contact looking like three more nav items that had
            drifted to the bottom. Above, it says where the nav ends. */}
        <SidebarSeparator className="mt-auto" />
        <SidebarGroup className="px-2 mb-0">
          <SidebarMenu>
            <SidebarMenuButton
              onClick={() => useAmbientStore.getState().openDrawer()}
              className="rounded-xl hover:bg-accent/50 gap-2.5"
              data-tutorial="ambient-sounds"
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
              {!isSidebarCollapsed && <span className="text-xs font-medium text-muted-foreground">Ambient Sounds</span>}
            </SidebarMenuButton>
            <SidebarMenuButton
              onClick={() => setNotificationSettingsOpen(true)}
              className="rounded-xl hover:bg-accent/50 gap-2.5"
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {!isSidebarCollapsed && <span className="text-xs font-medium text-muted-foreground">Notifications</span>}
            </SidebarMenuButton>
            <SidebarMenuButton
              onClick={() => setContactDrawerOpen(true)}
              className="rounded-xl hover:bg-accent/50 gap-2.5"
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              {!isSidebarCollapsed && <span className="text-xs font-medium text-muted-foreground">Contact</span>}
            </SidebarMenuButton>
          </SidebarMenu>
        </SidebarGroup>

        {/* ── Footer: profile dropdown ─────────────────────────── */}
        {/* No separator here: `border-t` below already draws one, and two
            rules 1px apart was the reason the boundary read as being in the
            wrong place. */}
        <SidebarFooter className="p-2 border-t border-border/40">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                className={`h-auto py-2 rounded-lg hover:bg-foreground/[0.04] dark:hover:bg-foreground/[0.06] transition-colors ${isSidebarCollapsed ? 'justify-center' : ''
                  }`}
              >
                <div className="relative flex-shrink-0">
                  <Avatar className="h-7 w-7 rounded-[6px]">
                    <AvatarImage
                      src={profile.avatarUrl}
                      alt={profile.name}
                      className="rounded-[6px]"
                    />
                    <AvatarFallback className="rounded-[6px] text-[10px] font-medium" style={{ backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                      {profile.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -top-px -right-px w-2 h-2 bg-emerald-500 border-[1.5px] border-background rounded-full" />
                </div>
                {!isSidebarCollapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-[12px] font-medium text-foreground truncate leading-tight">
                      {profile.name}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground/70 truncate leading-tight mt-0.5">
                      {profile.role || 'member'}
                    </p>
                  </div>
                )}
              </SidebarMenuButton>
            </DropdownMenuTrigger>

            <DropdownMenuContent side="top" align="start" className="w-56" sideOffset={8}>
              <DropdownMenuLabel>{profile.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => router.push('/intelligence')}>
                <UserIcon size={14} className="text-muted-foreground" />
                Profile
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setNotificationSettingsOpen(true)}>
                <SettingsIcon size={14} className="text-muted-foreground" />
                Settings
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setAccountDataOpen(true)}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Your data
              </DropdownMenuItem>

              <DropdownMenuItem onClick={startTutorial}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                  <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                Take a tour
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              {/* ── Calendar integrations ─────────────────────── */}
              <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60 px-2 py-1 font-medium">
                Calendars
              </DropdownMenuLabel>

              <DropdownMenuItem
                onClick={handleOutlookConnect}
                disabled={outlookLoading}
                className="gap-2.5"
              >
                <OutlookProviderIcon size={16} />
                <span className="flex-1 text-sm">Outlook</span>
                <span className={[
                  'text-[9px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 border',
                  outlookConnected
                    ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                    : 'text-muted-foreground/60 border-border/50',
                ].join(' ')}>
                  {outlookLoading ? '…' : outlookConnected ? 'Synced' : 'Not synced'}
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={handleGoogleCalendarConnect}
                disabled={googleCalLoading}
                className="gap-2.5"
              >
                <GoogleProviderIcon size={16} />
                <span className="flex-1 text-sm">Google Calendar</span>
                <span className={[
                  'text-[9px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 border',
                  googleCalConnected
                    ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                    : 'text-muted-foreground/60 border-border/50',
                ].join(' ')}>
                  {googleCalLoading ? '…' : googleCalConnected ? 'Synced' : 'Not synced'}
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem onClick={openCalendarFiltersDialog} className="gap-2.5">
                <SettingsIcon size={14} className="text-muted-foreground" />
                <span className="flex-1 text-sm">Calendar Filters</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                onSelect={(e) => {
                  // Radix dispatches onSelect on the first activation
                  // (click / Enter). Calling it directly here avoids the
                  // double-click bug where onClick raced the menu's own
                  // close-and-blur cycle and the first click was eaten.
                  e.preventDefault();
                  handleSignOut();
                }}
              >
                <LogOutIcon size={14} />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <CustomContextDialog
        open={customContextDialogOpen}
        onOpenChange={setCustomContextDialogOpen}
        onSave={(name, color) => {
          return addCustomCategory(name, color);
        }}
      />
      <CustomContextDialog
        open={Boolean(editingContext)}
        onOpenChange={(open) => {
          if (!open) setEditingContextName(null);
        }}
        onSave={(name, color) => {
          if (!editingContextName) return;
          const saved = updateContext(editingContextName, { name, color });
          if (saved) {
            setEditingContextName(null);
          }
        }}
        initialName={editingContext?.name ?? ''}
        initialColor={editingContext?.color ?? '#EF4444'}
        mode="edit"
      />
      <Dialog open={calendarFiltersOpen} onOpenChange={setCalendarFiltersOpen}>
        <DialogContent className="sm:max-w-lg p-5">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Calendar Filters</DialogTitle>
            <DialogDescription>
              Pick exactly which external calendars should appear in Lumina.
            </DialogDescription>
          </DialogHeader>

          {calendarFiltersLoading ? (
            <div className="space-y-3 py-2">
              <div className="h-11 rounded-xl bg-muted/50 animate-pulse" />
              <div className="h-11 rounded-xl bg-muted/50 animate-pulse" />
              <div className="h-11 rounded-xl bg-muted/50 animate-pulse" />
            </div>
          ) : calendarFilters.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
              No external calendars found yet. Connect Google or Outlook to start filtering.
            </div>
          ) : (
            <div className="space-y-3 max-h-[52vh] overflow-y-auto pr-1">
              {(['google', 'microsoft'] as const).map((provider) => {
                const rows = calendarFilters.filter((row) => row.provider === provider);
                if (rows.length === 0) return null;

                const enabledCount = rows.filter((row) => row.enabled).length;

                return (
                  <div key={provider} className="rounded-2xl border border-border/70 bg-card overflow-hidden">
                    <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/60 bg-muted/30">
                      <div className="flex items-center gap-2">
                        {provider === 'google' ? <GoogleProviderIcon size={16} /> : <OutlookProviderIcon size={16} />}
                        <span className="text-sm font-medium text-foreground">
                          {provider === 'google' ? 'Google Calendar' : 'Outlook'}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {enabledCount}/{rows.length} enabled
                      </span>
                    </div>

                    <div className="p-2 space-y-1.5">
                      {rows.map((calendar) => {
                        const isSaving = savingCalendarId === calendar.id;

                        return (
                          <div
                            key={calendar.id}
                            className="flex items-center justify-between rounded-xl border border-border/50 bg-background px-2.5 py-2"
                          >
                            <div className="min-w-0 flex items-center gap-2.5">
                              <span
                                className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
                                style={{ backgroundColor: calendar.color || 'hsl(var(--primary))' }}
                              />
                              <span className="truncate text-sm text-foreground">{calendar.name}</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => void toggleCalendarFilter(calendar)}
                              disabled={isSaving}
                              aria-label={calendar.enabled ? `Disable ${calendar.name}` : `Enable ${calendar.name}`}
                              className={[
                                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                                calendar.enabled ? 'bg-primary' : 'bg-muted',
                                isSaving ? 'opacity-60 cursor-wait' : 'cursor-pointer',
                              ].join(' ')}
                            >
                              <span
                                className={[
                                  'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform',
                                  calendar.enabled ? 'translate-x-6' : 'translate-x-1',
                                ].join(' ')}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              onClick={() => void loadCalendarFilters()}
              disabled={calendarFiltersLoading}
            >
              Refresh List
            </Button>
            <Button onClick={() => setCalendarFiltersOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(contextPendingDelete)} onOpenChange={(open) => { if (!open) setContextPendingDelete(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Delete Context</DialogTitle>
            <DialogDescription>
              This context is used by {tasksUsingPendingContext} task{tasksUsingPendingContext === 1 ? '' : 's'}.
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Deleting it will remove the context from those tasks.
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setContextPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteContext}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ContactDrawer open={contactDrawerOpen} onClose={() => setContactDrawerOpen(false)} />
      <NotificationSettings open={notificationSettingsOpen} onOpenChange={setNotificationSettingsOpen} />
      <AccountDataSheet open={accountDataOpen} onOpenChange={setAccountDataOpen} />
    </motion.aside>
  );
};

/* ─── Sidebar nav active/hover indicator ─────────────────────────────────────── */
/**
 * Per-item active / hover treatment shared by EVERY sidebar nav item.
 *
 * A neutral wash (shown on hover OR active) plus a brand-primary left rail
 * (active only). Both are always mounted and cross-fade via OPACITY only — no
 * shared-layout animation, so there is no handoff to race between items (the old
 * cause of the "sometimes it shows, sometimes it doesn't" bug), and only opacity
 * animates, never a paint property. The rail's presence is the active-vs-hover
 * signal. Honours prefers-reduced-motion (no fade) and is a single cheap
 * compositor layer.
 */
function NavItemIndicator({ active }: { active: boolean }) {
  return (
    <>
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 rounded-lg bg-muted transition-opacity duration-150 motion-reduce:transition-none ${
          active ? 'opacity-100' : 'opacity-0 group-hover/workspace:opacity-100'
        }`}
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary transition-opacity duration-150 motion-reduce:transition-none ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </>
  );
}

/* ─── Workspace nav item ────────────────────────────────────────────────────── */
interface WorkspaceItemProps {
  icon: React.FC<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  isActive: boolean;
  collapsed: boolean;
  showTooltip: boolean;
  href: string;
  onClick: () => void;
  dataTutorial?: string;
  /** Small count badge shown after the label */
  badge?: number;
}

const WorkspaceItem = React.memo<WorkspaceItemProps>(
  ({ icon: Icon, label, isActive, collapsed, showTooltip, href, onClick, dataTutorial, badge }) => (
    <SidebarMenuItem>
      <Tooltip>
        <TooltipTrigger asChild>
          <SidebarMenuButton
            isActive={isActive}
            onClick={onClick}
            aria-label={label}
            className={`group/workspace relative h-8 hover:bg-transparent dark:hover:bg-transparent ${collapsed ? 'justify-center' : ''}`}
            {...(dataTutorial ? { 'data-tutorial': dataTutorial } : {})}
          >
            {/* Invisible Link for prefetching — pointer-events-none so button click wins */}
            <Link href={href} prefetch className="absolute inset-0 pointer-events-none" aria-hidden tabIndex={-1} />
            <NavItemIndicator active={isActive} />
            <Icon
              size={15}
              strokeWidth={1.75}
              className={`relative z-10 flex-shrink-0 transition-colors ${isActive ? 'text-foreground' : 'text-muted-foreground/80 group-hover/workspace:text-foreground'
                }`}
            />
            {!collapsed && (
              <span className={`relative z-10 font-sans text-[13px] truncate transition-colors ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground/90'}`}>{label}</span>
            )}
            {!collapsed && badge != null && badge > 0 && (
              <span className={`relative z-10 ml-auto text-[10px] font-mono font-medium tabular-nums transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground/60'}`}>
                {badge}
              </span>
            )}
          </SidebarMenuButton>
        </TooltipTrigger>
        {showTooltip && <TooltipContent side="right">{label}</TooltipContent>}
      </Tooltip>
    </SidebarMenuItem>
  )
);
WorkspaceItem.displayName = 'WorkspaceItem';

/* ─── Inline docs tree (compact, nested) ───────────────────────────────────── */

function buildDocsTree(docs: DocTreeNode[]): (DocTreeNode & { children: DocTreeNode[] })[] {
  const childrenMap = new Map<string | 'root', DocTreeNode[]>();
  for (const doc of docs) {
    if (doc.isArchived) continue;
    const key = doc.parentId ?? 'root';
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(doc);
  }
  function attach(node: DocTreeNode): DocTreeNode & { children: DocTreeNode[] } {
    const kids = (childrenMap.get(node.id) ?? []).sort((a, b) => a.position - b.position).map(attach);
    return { ...node, children: kids };
  }
  return (childrenMap.get('root') ?? [])
    .sort((a, b) => { if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1; return a.position - b.position; })
    .map(attach);
}

type TreeNode = DocTreeNode & { children: TreeNode[] };

const InlineDocItem: React.FC<{ node: TreeNode; depth: number }> = ({ node, depth }) => {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = pathname === `/docs/${node.id}`;
  const expandedIds = useDocsStore((s) => s.expandedIds);
  const toggleExpanded = useDocsStore((s) => s.toggleExpanded);
  const updateDoc = useDocsStore((s) => s.updateDoc);
  const archiveDoc = useDocsStore((s) => s.archiveDoc);
  const pinDoc = useDocsStore((s) => s.pinDoc);
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.includes(node.id);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const startRename = useCallback(() => {
    setRenameValue(node.title);
    setIsRenaming(true);
  }, [node.title]);

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== node.title) {
      updateDoc(node.id, { title: trimmed.slice(0, 512) });
    }
    setIsRenaming(false);
  }, [renameValue, node.title, node.id, updateDoc]);

  const handleDelete = useCallback(() => {
    archiveDoc(node.id);
    setShowDeleteConfirm(false);
    if (pathname === `/docs/${node.id}`) {
      router.push('/docs');
    }
  }, [archiveDoc, node.id, pathname, router]);

  return (
    <>
      <div
        className={`group flex items-center gap-1.5 py-1 rounded-md text-xs transition-colors ${
          isActive
            ? 'bg-accent/60 text-foreground font-medium'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }`}
        style={{ paddingLeft: `${20 + depth * 12}px`, paddingRight: '4px' }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center"
            onClick={() => toggleExpanded(node.id)}
          >
            <motion.svg
              width={8} height={8} viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.1 }}
            >
              <polyline points="9 18 15 12 9 6" />
            </motion.svg>
          </button>
        ) : (
          <span className="flex-shrink-0 w-3.5" />
        )}
        {node.icon ? (
          <span className="flex-shrink-0 text-[11px] leading-none">{node.icon}</span>
        ) : (
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
            className="flex-shrink-0 text-muted-foreground/50"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        )}

        {isRenaming ? (
          <input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value.slice(0, 512))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
              if (e.key === 'Escape') setIsRenaming(false);
            }}
            onBlur={commitRename}
            className="flex-1 min-w-0 bg-transparent text-xs outline-none border-b border-primary/50"
            autoFocus
          />
        ) : showDeleteConfirm ? (
          <span className="flex-1 flex items-center gap-1 min-w-0 overflow-hidden">
            <span className="text-destructive text-[10px] font-medium flex-shrink-0">Delete?</span>
            <button type="button" onClick={handleDelete} className="flex-shrink-0 text-[10px] text-destructive hover:underline font-semibold">Yes</button>
            <button type="button" onClick={() => setShowDeleteConfirm(false)} className="flex-shrink-0 text-[10px] text-muted-foreground hover:underline">No</button>
          </span>
        ) : (
          <>
            <Link
              href={`/docs/${node.id}`}
              className="flex-1 truncate min-w-0"
              onDoubleClick={(e) => { e.preventDefault(); startRename(); }}
            >
              {node.title}
            </Link>
            {node.isPinned && (
              <span
                className="flex-shrink-0 text-primary/60 group-hover:hidden"
                title="Pinned"
                aria-label="Pinned"
              >
                <svg
                  width={9}
                  height={9}
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M16 3a1 1 0 0 1 1 1v1.586l2.707 2.707A1 1 0 0 1 19 10h-5v7l-2 4-2-4v-7H5a1 1 0 0 1-.707-1.707L7 5.586V4a1 1 0 0 1 1-1h8Z" />
                </svg>
              </span>
            )}
            <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                title="Delete"
                onClick={(e) => { e.preventDefault(); setShowDeleteConfirm(true); }}
                className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground/40 hover:text-destructive transition-colors"
              >
                <TrashIcon size={10} />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreIcon size={10} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={4} className="w-36">
                  <DropdownMenuItem onClick={startRename}>
                    <EditIcon size={12} />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => pinDoc(node.id, !node.isPinned)}>
                    {node.isPinned ? 'Unpin' : 'Pin'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <TrashIcon size={12} />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
      </div>
      {isExpanded && hasChildren && node.children.map((child) => (
        <InlineDocItem key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
};

const SidebarDocsInlineTree: React.FC<{ docs: DocTreeNode[] }> = ({ docs }) => {
  const tree = buildDocsTree(docs);
  if (tree.length === 0) return null;
  return (
    <div className="mt-0.5 mb-1">
      {tree.map((node) => (
        <InlineDocItem key={node.id} node={node as TreeNode} depth={0} />
      ))}
    </div>
  );
};

// ── SidebarGoalsWidget ───────────────────────────────────────────────────────
// Keeps the user's active goals + live progress visible while working.
// Hidden entirely when there are no active goals — no chrome until earned.

const SidebarGoalsWidget: React.FC<{ collapsed: boolean }> = ({ collapsed }) => {
  const router = useRouter();
  // Subscribe to the stable goals array — deriving (filter+sort) inside the
  // selector returns a fresh array on every snapshot and triggers React's
  // useSyncExternalStore "getSnapshot not cached" infinite-loop warning.
  const allGoals = useGoalsStore(s => s.goals);
  const activeGoals = React.useMemo(
    () => allGoals
      .filter((g) => g.status === 'active')
      .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime()),
    [allGoals],
  );
  if (collapsed) return null;
  if (activeGoals.length === 0) return null;
  return (
    <SidebarGroup className="px-2 mt-1">
      <SidebarGroupLabel className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/50 px-2 mb-1">
        Goals
      </SidebarGroupLabel>
      <div className="space-y-1.5 px-2">
        {activeGoals.slice(0, 4).map((goal) => {
          const progress = typeof goal.progress === 'number' && (goal.taskCount ?? 0) > 0
            ? goal.progress
            : Math.round(
                goal.targets.length > 0
                  ? goal.targets.reduce((acc, t) => {
                      const pct = t.targetValue > 0 ? (t.currentValue / t.targetValue) * 100 : 0;
                      return acc + Math.min(100, Math.max(0, pct));
                    }, 0) / goal.targets.length
                  : 0,
              );
          const truncated = goal.title.length > 18 ? `${goal.title.slice(0, 17)}…` : goal.title;
          return (
            <button
              key={goal.id}
              type="button"
              onClick={() => router.push(`/tasks?goal=${goal.id}`)}
              title={`${goal.title} — ${progress}%`}
              className="group w-full text-left rounded-lg px-2 py-1 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[12px] text-foreground truncate flex-1">{truncated}</span>
                <span className="text-[10px] tabular-nums text-muted-foreground/70 flex-shrink-0">{progress}%</span>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${progress >= 100 ? 'bg-emerald-400' : 'bg-primary'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </SidebarGroup>
  );
};

export default AppSidebar;
