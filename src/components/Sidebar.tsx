'use client';

import React, { useState } from 'react';
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
import { useTutorialStore } from '../store/useTutorialStore';
import { useAmbientStore } from '../store/useAmbientStore';
import ContactDrawer from './contact/ContactDrawer';
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

const AppSidebar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const authClient = useLuminaAuthClient();
  const { data: _session } = authClient.useSession();
  const _userId = _session?.user?.id ?? null;
  const resetOnboarding = useOnboardingStore((s) => s.reset);
  const startTutorial = useTutorialStore((s) => s.startTutorial);
  const focusSessionLength = useSettingsStore((s) => s.focusSessionLength);
  const tasks = useTaskBoardStore((s) => s.tasks);
  const {
    openModal,
    activeFilters,
    toggleFilter,
    profile,
    insights,
    activeFocusSession,
    startFocusSession,
    cancelFocusSession,
    isSidebarCollapsed,
    setSidebarCollapsed,
    customCategories,
    addCustomCategory,
    updateContext,
    deleteContext,
  } = useCalendarStore();
  const {
    outlookConnected,
    outlookSyncing,
    setOutlookConnected,
    setOutlookEvents,
    setGoogleEvents,
    clearExternalEvents,
  } = usePlannerStore();
  const googleEvents = usePlannerStore((s) => s.googleEvents);

  const [outlookLoading, setOutlookLoading] = React.useState(false);
  const [customContextDialogOpen, setCustomContextDialogOpen] = useState(false);
  const [contactDrawerOpen, setContactDrawerOpen] = useState(false);
  const [editingContextName, setEditingContextName] = useState<string | null>(null);
  const [contextPendingDelete, setContextPendingDelete] = useState<string | null>(null);
  const [openContextMenu, setOpenContextMenu] = useState<string | null>(null);
  const isCalendarPage = pathname === '/';
  const isIntelligencePage = pathname === '/intelligence';
  const isTasksPage = pathname === '/tasks';
  const isPlanPage = pathname === '/plan';

  const allCategories = [...CATEGORIES, ...customCategories];
  const tasksUsingPendingContext = contextPendingDelete
    ? tasks.filter((task) => task.context === contextPendingDelete).length
    : 0;
  const editingContext = editingContextName
    ? customCategories.find((category) => category.name === editingContextName) ?? null
    : null;

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

  const integrationLabel = React.useCallback((provider: IntegrationProvider) => {
    return provider === 'google' ? 'Google Calendar' : 'Outlook';
  }, []);

  const isGoogleBlockedContextError = React.useCallback((error?: string | null) => {
    if (!error) return false;
    const normalized = error.toLowerCase();
    return (
      normalized.includes('access_denied')
      || normalized.includes('oauth_error')
      || normalized.includes('browser')
      || normalized.includes('secure')
    );
  }, []);

  const getIntegrationFailureMessage = React.useCallback(
    (provider: IntegrationProvider, result: IntegrationPopupResult) => {
      if (result.ok) {
        return `${integrationLabel(provider)} connection was not completed. Try again in a regular browser window.`;
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
        return `${integrationLabel(provider)} popup was closed before completion. Connection was not completed.`;
      }

      if (failedResult.reason === 'timeout') {
        return `${integrationLabel(provider)} popup timed out. OAuth failed. Connection was not completed. Try again in a regular browser window.`;
      }

      if (failedResult.reason === 'status-false') {
        return `${integrationLabel(provider)} OAuth finished but status stayed disconnected. Connection was not completed. Try again in a regular browser window.`;
      }

      return `${integrationLabel(provider)} OAuth failed. Connection was not completed. Try again in a regular browser window.`;
    },
    [integrationLabel, isGoogleBlockedContextError],
  );

  /**
   * Opens a popup to our integration connect endpoint (NOT BetterAuth login).
   * The connect endpoint redirects to the provider's OAuth screen with the
   * appropriate calendar scopes, then our callback stores tokens in the DB
   * and redirects to /auth/popup-complete which posts the completion message.
   */
  const openIntegrationPopup = React.useCallback(
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

  const [googleCalLoading, setGoogleCalLoading] = React.useState(false);
  const [googleCalConnected, setGoogleCalConnected] = React.useState(false);
  const [calendarFiltersOpen, setCalendarFiltersOpen] = React.useState(false);
  const [calendarFiltersLoading, setCalendarFiltersLoading] = React.useState(false);
  const [calendarFilters, setCalendarFilters] = React.useState<ExternalCalendarFilter[]>([]);
  const [savingCalendarId, setSavingCalendarId] = React.useState<string | null>(null);

  const refreshIntegrationStatus = React.useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/status', { cache: 'no-store' });
      if (!res.ok) {
        setGoogleCalConnected(false);
        setOutlookConnected(false);
        setOutlookEvents([]);
        return { google: false, microsoft: false };
      }

      const data = (await res.json()) as {
        google?: { connected: boolean };
        microsoft?: { connected: boolean };
      };

      const isGoogleConnected = Boolean(data.google?.connected);
      const isMicrosoftConnected = Boolean(data.microsoft?.connected);

      setGoogleCalConnected(isGoogleConnected);
      setOutlookConnected(isMicrosoftConnected);

      if (!isMicrosoftConnected) {
        setOutlookEvents([]);
      }

      return { google: isGoogleConnected, microsoft: isMicrosoftConnected };
    } catch {
      setGoogleCalConnected(false);
      setOutlookConnected(false);
      setOutlookEvents([]);
      return { google: false, microsoft: false };
    }
  }, [setOutlookConnected, setOutlookEvents]);

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

  const confirmIntegration = React.useCallback(async (provider: IntegrationProvider) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const status = await refreshIntegrationStatus();
      const connected = provider === 'google' ? status.google : status.microsoft;
      if (connected) return true;
      if (attempt < 2) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
      }
    }

    return false;
  }, [refreshIntegrationStatus]);

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
        await refreshIntegrationStatus();
        toast.success('Outlook Calendar disconnected.', { id: disconnectToastId, duration: 2_500 });
      } catch (err) {
        console.error('[Sidebar Outlook disconnect]', err);
        await refreshIntegrationStatus();
        toast.error('Failed to disconnect Outlook Calendar.', { id: disconnectToastId, duration: 4_000 });
      }
      return;
    }

    setOutlookLoading(true);
    try {
      const popupResult = await openIntegrationPopup('microsoft');

      if (!popupResult.ok) {
        await refreshIntegrationStatus();
        notify(getIntegrationFailureMessage('microsoft', popupResult));
        return;
      }

      const confirmed = await confirmIntegration('microsoft');
      if (!confirmed) {
        notify(
          getIntegrationFailureMessage('microsoft', {
            ok: false,
            reason: 'status-false',
          }),
        );
        return;
      }

      window.dispatchEvent(new Event('lumina:external-sync-now'));
    } catch (err) {
      await refreshIntegrationStatus();
      console.error('[Sidebar Outlook]', err);
      notify('Outlook OAuth failed. Connection was not completed. Try again in a regular browser window.');
    } finally {
      setOutlookLoading(false);
    }
  }, [
    confirmIntegration,
    getIntegrationFailureMessage,
    openIntegrationPopup,
    outlookConnected,
    refreshIntegrationStatus,
  ]);

  React.useEffect(() => {
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
      const popupResult = await openIntegrationPopup('google');

      if (!popupResult.ok) {
        await refreshIntegrationStatus();
        notify(getIntegrationFailureMessage('google', popupResult));
        return;
      }

      const confirmed = await confirmIntegration('google');
      if (!confirmed) {
        notify(
          getIntegrationFailureMessage('google', {
            ok: false,
            reason: 'status-false',
          }),
        );
        return;
      }

      window.dispatchEvent(new Event('lumina:external-sync-now'));
    } catch (err) {
      await refreshIntegrationStatus();
      console.error('[Sidebar Google]', err);
      notify('Google OAuth failed. Connection was not completed. Try again in a regular browser window.');
    } finally {
      setGoogleCalLoading(false);
    }
  }, [
    confirmIntegration,
    getIntegrationFailureMessage,
    googleCalConnected,
    openIntegrationPopup,
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
      className="relative hidden lg:flex flex-col h-full bg-background border-r border-border/60 z-40 "
    >
      {/* Collapse toggle */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setSidebarCollapsed(!isSidebarCollapsed)}
        className="absolute -right-3 top-12 h-6 w-6 min-h-6 min-w-6 p-0 rounded-full border border-border/80 bg-background shadow-sm z-50 hover:bg-accent/50 transition-colors flex items-center justify-center"
      >
        {isSidebarCollapsed ? (
          <ChevronRightIcon size={12} className="flex-shrink-0" />
        ) : (
          <ChevronLeftIcon size={12} className="flex-shrink-0" />
        )}
      </Button>

      <Sidebar className="h-full">
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
                <span className="font-logo text-[22px] font-semibold tracking-[-0.03em] text-primary dark:text-foreground leading-none">
                  Lumina
                </span>
              </div>

              {/* Streak badge */}
              <div className="flex flex-col items-end pb-0.5">
                <span className="font-sans text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/50 leading-none mb-1">
                  Streak
                </span>
                <div className="flex items-baseline gap-0.5">
                  <span className="font-display text-2xl font-semibold text-primary dark:text-foreground leading-none tabular-nums">
                    {profile.intelligence.focusStreak}
                  </span>
                  <span className="font-sans text-[11px] font-medium text-muted-foreground leading-none mb-0.5">
                    d
                  </span>
                </div>
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
                    router.push('/');
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
              {isSidebarCollapsed && <TooltipContent side="right">New Entry</TooltipContent>}
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
                {isSidebarCollapsed && <TooltipContent side="right">Start Focus</TooltipContent>}
              </Tooltip>
            )}
          </div>
        </SidebarHeader>

        <SidebarSeparator />

        {/* ── Content ────────────────────────────────────────────── */}
        <SidebarContent className="px-2 py-3 gap-1 no-scrollbar">
          {/* Insights */}
          {!isSidebarCollapsed && insights.length > 0 && (
            <SidebarGroup className="px-2 mb-2">
              <SidebarGroupLabel className="flex items-center gap-2 px-1">
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
            <SidebarGroupContent>
              <SidebarMenu>
                <WorkspaceItem
                  icon={LayoutGridIcon}
                  label="Calendar"
                  isActive={isCalendarPage}
                  collapsed={isSidebarCollapsed}
                  href="/"
                  onClick={() => router.push('/')}
                  dataTutorial="nav-calendar"
                />
                <WorkspaceItem
                  icon={PomodoroIcon}
                  label="Pomodoro"
                  isActive={pathname === '/pomodoro'}
                  collapsed={isSidebarCollapsed}
                  href="/pomodoro"
                  onClick={() => router.push('/pomodoro')}
                />
                <WorkspaceItem
                  icon={InsightsIcon}
                  label="Insights"
                  isActive={isIntelligencePage}
                  collapsed={isSidebarCollapsed}
                  href="/intelligence"
                  onClick={() => router.push('/intelligence')}
                  dataTutorial="nav-intelligence"
                />
                <WorkspaceItem
                  icon={KanbanIcon}
                  label="Tasks"
                  isActive={isTasksPage}
                  collapsed={isSidebarCollapsed}
                  href="/tasks"
                  onClick={() => router.push('/tasks')}
                  dataTutorial="nav-tasks"
                />
                <WorkspaceItem
                  icon={PlanDayIcon}
                  label="Plan Day"
                  isActive={isPlanPage}
                  collapsed={isSidebarCollapsed}
                  href="/plan"
                  onClick={() => router.push('/plan')}
                  dataTutorial="nav-plan"
                />
                <WorkspaceItem
                  icon={BarChart3Icon}
                  label="Performance"
                  isActive={pathname === '/performance'}
                  collapsed={isSidebarCollapsed}
                  href="/performance"
                  onClick={() => router.push('/performance')}
                  dataTutorial="nav-performance"
                />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Contexts */}
          <SidebarGroup className="px-2 mt-1" data-tutorial="contexts">
            {!isSidebarCollapsed && (
              <div className="flex items-center justify-between px-2 mb-2">
                <SidebarGroupLabel>Contexts</SidebarGroupLabel>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setCustomContextDialogOpen(true)}
                      className="p-1 rounded-md hover:bg-accent/50 transition-colors"
                    >
                      <PlusIcon size={12} className="text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Add Custom Context</TooltipContent>
                </Tooltip>
              </div>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {allCategories.map((cat) => (
                  <SidebarMenuItem key={cat.name}>
                    <div className="group relative flex items-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            onClick={() => toggleFilter(cat.name)}
                            isActive={activeFilters.includes(cat.name)}
                            className={`${isSidebarCollapsed ? 'justify-center' : 'pr-9'}`}
                          >
                            <div
                              className="flex-shrink-0 w-[7px] h-[7px] rounded-full"
                              style={{ backgroundColor: cat.color, opacity: 0.75 }}
                            />
                            {!isSidebarCollapsed && (
                              <span className="font-sans text-sm truncate">{cat.name}</span>
                            )}
                          </SidebarMenuButton>
                        </TooltipTrigger>
                        {isSidebarCollapsed && (
                          <TooltipContent side="right">{cat.name}</TooltipContent>
                        )}
                      </Tooltip>

                      {!isSidebarCollapsed && customCategories.some((context) => context.name === cat.name) && (
                        <div className={`absolute right-1 top-1/2 -translate-y-1/2 transition-opacity ${openContextMenu === cat.name ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <DropdownMenu
                            open={openContextMenu === cat.name}
                            onOpenChange={(open) => setOpenContextMenu(open ? cat.name : null)}
                          >
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Manage ${cat.name} context`}
                              >
                                <MoreIcon size={13} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44" sideOffset={6}>
                              <DropdownMenuItem onClick={() => { setOpenContextMenu(null); setEditingContextName(cat.name); }}>
                                <EditIcon size={13} />
                                Edit Context
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => { setOpenContextMenu(null); handleDeleteContext(cat.name); }}
                                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                              >
                                <TrashIcon size={13} />
                                Delete Context
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* ── Utility actions ───────────────────────────────────── */}
        <SidebarGroup className="px-2 mt-auto mb-0">
          <SidebarMenu>
            <SidebarMenuButton
              onClick={() => useAmbientStore.getState().openDrawer()}
              className="rounded-xl hover:bg-accent/50 gap-2.5"
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
              {!isSidebarCollapsed && <span className="text-xs font-medium text-muted-foreground">Ambient Sounds</span>}
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
        <SidebarSeparator />
        <SidebarFooter className="p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                className={`h-auto py-2.5 rounded-xl hover:bg-accent/50 ${isSidebarCollapsed ? 'justify-center' : ''
                  }`}
              >
                <div className="relative flex-shrink-0">
                  <Avatar className="h-7 w-7 rounded-[8px]">
                    <AvatarImage
                      src={profile.avatarUrl}
                      alt={profile.name}
                      className="rounded-[8px]"
                    />
                    <AvatarFallback className="rounded-[8px] text-[10px] font-bold" style={{ backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                      {profile.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 border-[1.5px] border-background rounded-full" />
                </div>
                {!isSidebarCollapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-xs font-medium text-foreground truncate">
                      {profile.name}
                    </p>
                    <p className="font-sans text-[10px] text-muted-foreground truncate leading-tight">
                      {profile.role || ''}
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

              <DropdownMenuItem>
                <SettingsIcon size={14} className="text-muted-foreground" />
                Settings
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
                onClick={resetOnboarding}
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
    </motion.aside>
  );
};

/* ─── Workspace nav item ────────────────────────────────────────────────────── */
interface WorkspaceItemProps {
  icon: React.FC<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  isActive: boolean;
  collapsed: boolean;
  href: string;
  onClick: () => void;
  dataTutorial?: string;
}

const WorkspaceItem = React.memo<WorkspaceItemProps>(
  ({ icon: Icon, label, isActive, collapsed, href, onClick, dataTutorial }) => (
    <SidebarMenuItem>
      <Tooltip>
        <TooltipTrigger asChild>
          <SidebarMenuButton
            isActive={isActive}
            onClick={onClick}
            className={`relative ${collapsed ? 'justify-center' : ''}`}
            {...(dataTutorial ? { 'data-tutorial': dataTutorial } : {})}
          >
            {/* Invisible Link for prefetching — pointer-events-none so button click wins */}
            <Link href={href} prefetch className="absolute inset-0 pointer-events-none" aria-hidden tabIndex={-1} />
            {isActive && (
              <motion.div
                layoutId="sidebar-active-nav"
                className="absolute inset-0 rounded-xl bg-accent/70"
                transition={{ duration: 0.15, ease: 'easeOut' }}
              />
            )}
            <Icon
              size={16}
              strokeWidth={1.5}
              className={`relative z-10 flex-shrink-0 transition-colors ${isActive ? 'text-foreground' : 'text-muted-foreground'
                }`}
            />
            {!collapsed && (
              <span className="relative z-10 font-sans text-sm truncate">{label}</span>
            )}
          </SidebarMenuButton>
        </TooltipTrigger>
        {collapsed && <TooltipContent side="right">{label}</TooltipContent>}
      </Tooltip>
    </SidebarMenuItem>
  )
);
WorkspaceItem.displayName = 'WorkspaceItem';

export default AppSidebar;
