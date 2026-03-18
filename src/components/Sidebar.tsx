'use client';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { CATEGORIES } from '../constants';
import { useCalendarStore } from '../store/useCalendarStore';
import { usePlannerStore } from '../store/usePlannerStore';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { useTaskBoardStore } from '../store/useTaskBoardStore';
import CustomContextDialog from './CustomContextDialog';
import {
  PlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SparkIcon as SparklesIcon,
  MonthIcon as LayoutGridIcon,
  TargetIcon as BarChart3Icon,
  TimerIcon,
  CloseIcon as SquareIcon,
  ClockIcon,
  SettingsIcon,
  ExternalLinkIcon,
} from './icons';
import { clearOutlookData } from '../services/outlookSyncService';
import { useLuminaAuthClient } from './AuthProvider';
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

const PlanDayIcon: React.FC<{ size?: number; strokeWidth?: number; className?: string }> = ({ size = 16, strokeWidth = 1.5, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="14" x2="12" y2="14" /><line x1="8" y1="18" x2="16" y2="18" />
  </svg>
);

/* ─── Real Microsoft Outlook icon ─────────────────────────────────────────── */
const OutlookSidebarIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" className={className} xmlns="http://www.w3.org/2000/svg">
    <path fill="#0277bd" d="M28.093 33H40c2.209 0 4-1.791 4-4V19c0-2.209-1.791-4-4-4H28.093v18z"/>
    <path fill="#03a9f4" d="M16 15L28.093 15 28.093 33 16 33z"/>
    <path fill="#4fc3f7" d="M28.093 20L38 20 38 28 28.093 28z"/>
    <path fill="#0288d1" d="M21 11H6c-2.209 0-4 1.791-4 4v18c0 2.209 1.791 4 4 4h15V11z"/>
    <path fill="#fff" d="M12.915 26.687c-2.31 0-3.921-1.666-3.921-4.062s1.583-4.103 3.935-4.103c2.31 0 3.894 1.638 3.894 4.075S15.225 26.687 12.915 26.687zM12.929 20.081c-1.391 0-2.233 1.055-2.233 2.544 0 1.502.828 2.502 2.219 2.502 1.405 0 2.219-1.027 2.219-2.516C15.134 21.08 14.334 20.081 12.929 20.081z"/>
  </svg>
);

/* ─── Google G brand icon ─────────────────────────────────────────────────── */
const GoogleCalendarIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
    <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.591 4.418 1.582l3.491-3.49A11.932 11.932 0 0 0 12 0C7.27 0 3.198 2.698 1.24 6.65l4.026 3.115z" />
    <path fill="#34A853" d="M16.041 18.013A7.072 7.072 0 0 1 12 19.09c-2.973 0-5.535-1.853-6.6-4.487l-4.04 3.066C3.193 21.294 7.265 24 12 24c2.933 0 5.735-1.043 7.834-3.001l-3.793-2.986z" />
    <path fill="#4A90E2" d="M19.834 20.999C22.029 18.952 23.455 15.904 23.455 12c0-.71-.091-1.418-.273-2.09H12v4.545h6.436a5.463 5.463 0 0 1-1.638 2.902l3.036 2.642z" />
    <path fill="#FBBC05" d="M5.4 14.603A7.15 7.15 0 0 1 4.909 12c0-.56.076-1.104.214-1.624L1.24 7.26A11.981 11.981 0 0 0 0 12c0 1.92.444 3.73 1.237 5.335L5.4 14.603z" />
  </svg>
);

const AppSidebar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const authClient = useLuminaAuthClient();
  const resetOnboarding = useOnboardingStore((s) => s.reset);
  const focusSessionLength = useOnboardingStore((s) => s.focusSessionLength);
  const customFocusMinutes = useOnboardingStore((s) => s.customFocusMinutes);
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
  } = usePlannerStore();

  const [outlookLoading, setOutlookLoading] = React.useState(false);
  const [customContextDialogOpen, setCustomContextDialogOpen] = useState(false);
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

  /**
   * Opens a popup to our integration connect endpoint (NOT BetterAuth login).
   * The connect endpoint redirects to the provider's OAuth screen with the
   * appropriate calendar scopes, then our callback stores tokens in the DB
   * and redirects to /auth/popup-complete which posts the completion message.
   */
  const openIntegrationPopup = React.useCallback(
    async (provider: IntegrationProvider): Promise<boolean> => {
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
        throw new Error('Popup blocked. Please allow popups and try again.');
      }

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
    },
    [],
  );

  const handleOutlookConnect = React.useCallback(async () => {
    if (outlookConnected) {
      clearOutlookData();
      setOutlookConnected(false);
      setOutlookEvents([]);
      return;
    }

    setOutlookLoading(true);
    try {
      const completed = await openIntegrationPopup('microsoft');
      if (!completed) return;
      setOutlookConnected(true);
    } catch (err) {
      setOutlookConnected(false);
      setOutlookEvents([]);
      console.error('[Sidebar Outlook]', err);
    } finally {
      setOutlookLoading(false);
    }
  }, [outlookConnected, setOutlookConnected, setOutlookEvents, openIntegrationPopup]);

  const [googleCalLoading, setGoogleCalLoading] = React.useState(false);
  const [googleCalConnected, setGoogleCalConnected] = React.useState(false);

  // Restore integration connection state from the DB on mount
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/integrations/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { google?: { connected: boolean }; microsoft?: { connected: boolean } } | null) => {
        if (cancelled || !data) return;
        if (data.google?.connected) setGoogleCalConnected(true);
        if (data.microsoft?.connected) setOutlookConnected(true);
      })
      .catch(() => { /* non-critical, silently ignore */ });
    return () => { cancelled = true; };
  }, [setOutlookConnected]);

  const handleGoogleCalendarConnect = React.useCallback(async () => {
    if (googleCalConnected) {
      setGoogleCalConnected(false);
      return;
    }

    setGoogleCalLoading(true);
    try {
      const completed = await openIntegrationPopup('google');
      if (!completed) return;
      setGoogleCalConnected(true);
    } catch (err) {
      setGoogleCalConnected(false);
      console.error('[Sidebar Google]', err);
    } finally {
      setGoogleCalLoading(false);
    }
  }, [googleCalConnected, openIntegrationPopup]);
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
                      const mode =
                        focusSessionLength === '50/10' || focusSessionLength === '90/20'
                          ? 'deep'
                          : focusSessionLength === 'custom' && customFocusMinutes > 30
                            ? 'deep'
                            : 'classic';
                      startFocusSession(mode);
                    }}
                    className={`w-full flex items-center gap-2.5 h-9 rounded-xl bg-transparent hover:bg-muted/60 border border-border/50 text-muted-foreground hover:text-foreground transition-colors duration-150 ease-out text-sm font-medium font-sans ${isSidebarCollapsed ? 'justify-center px-0' : 'px-3'
                      }`}
                  >
                    <TimerIcon size={14} strokeWidth={1.5} />
                    {!isSidebarCollapsed && <span>Ignite Flow</span>}
                  </button>
                </TooltipTrigger>
                {isSidebarCollapsed && <TooltipContent side="right">Ignite Flow</TooltipContent>}
              </Tooltip>
            )}
          </div>
        </SidebarHeader>

        <SidebarSeparator />

        {/* ── Content ────────────────────────────────────────────── */}
        <SidebarContent className="px-2 py-3 gap-1 no-scrollbar">
          {/* Intelligence insights */}
          {!isSidebarCollapsed && insights.length > 0 && (
            <SidebarGroup className="px-2 mb-2">
              <SidebarGroupLabel className="flex items-center gap-2 px-1">
                <SparklesIcon size={10} className="text-primary/50" />
                Intelligence
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
            {!isSidebarCollapsed ? (
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            ) : (
              <div className="h-3" />
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                <WorkspaceItem
                  icon={LayoutGridIcon}
                  label="Calendar"
                  isActive={isCalendarPage}
                  collapsed={isSidebarCollapsed}
                  onClick={() => router.push('/')}
                />
                <WorkspaceItem
                  icon={SparklesIcon}
                  label="Intelligence"
                  isActive={isIntelligencePage}
                  collapsed={isSidebarCollapsed}
                  onClick={() => router.push('/intelligence')}
                />
                <WorkspaceItem
                  icon={KanbanIcon}
                  label="Tasks"
                  isActive={isTasksPage}
                  collapsed={isSidebarCollapsed}
                  onClick={() => router.push('/tasks')}
                />
                <WorkspaceItem
                  icon={PlanDayIcon}
                  label="Plan Day"
                  isActive={isPlanPage}
                  collapsed={isSidebarCollapsed}
                  onClick={() => router.push('/plan')}
                />
                <WorkspaceItem
                  icon={BarChart3Icon}
                  label="Performance"
                  isActive={pathname === '/performance'}
                  collapsed={isSidebarCollapsed}
                  onClick={() => router.push('/performance')}
                />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Contexts */}
          <SidebarGroup className="px-2 mt-1">
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
                    <AvatarFallback className="rounded-[8px] text-[10px] font-bold" style={{ backgroundColor: '#6D59E0', color: '#ffffff' }}>
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
                      {profile.role || 'Active now'}
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
                <OutlookSidebarIcon size={16} />
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
                <GoogleCalendarIcon size={16} />
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
    </motion.aside>
  );
};

/* ─── Workspace nav item ────────────────────────────────────────────────────── */
interface WorkspaceItemProps {
  icon: React.FC<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
}

const WorkspaceItem = React.memo<WorkspaceItemProps>(
  ({ icon: Icon, label, isActive, collapsed, onClick }) => (
    <SidebarMenuItem>
      <Tooltip>
        <TooltipTrigger asChild>
          <SidebarMenuButton
            isActive={isActive}
            onClick={onClick}
            className={`relative ${collapsed ? 'justify-center' : ''}`}
          >
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
