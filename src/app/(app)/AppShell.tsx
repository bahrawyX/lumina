"use client";

import React, { useEffect, useRef, useState, Suspense, lazy } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Sidebar from "@/components/Sidebar";
import EventModal from "@/components/EventModal";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { PageTransition } from "@/components/ui/PageTransition";
import AmbientSoundDrawer from "@/components/ambient/AmbientSoundDrawer";
import FloatingAmbientPlayer from "@/components/ambient/FloatingAmbientPlayer";
import PomodoroFloatingWidget from "@/components/focus/PomodoroFloatingWidget";
import { motion, AnimatePresence } from "framer-motion";
import { useCalendarStore } from "@/store/useCalendarStore";
import { ViewType } from "@/types";
import { useCalendarEventsStore } from "@/store/useCalendarEventsStore";
import { useOnboardingStore, useOnboardingHydrated } from "@/store/useOnboardingStore";
import { useTaskBoardStore } from "@/store/useTaskBoardStore";
import { useFocusStore } from "@/store/useFocusStore";
import { useOutlookSync } from "@/hooks/useOutlookSync";
import PersistenceBootstrap from "@/components/PersistenceBootstrap";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import OfflineIndicator from "@/components/pwa/OfflineIndicator";
import TutorialOverlay from "@/components/tutorial/TutorialOverlay";
import { GoogleProviderIcon, OutlookProviderIcon } from "@/components/icons";
import { GuestBanner } from "@/components/auth/GuestBanner";
import { useGuestStore } from "@/store/useGuestStore";
import { useLinkStore } from "@/store/useLinkStore";
import { TaskCompletionPrompt } from "@/components/tasks/TaskCompletionPrompt";
import { QuickCapture } from "@/components/quick-capture/QuickCapture";
import { useQuickCaptureStore } from "@/store/useQuickCaptureStore";

// Genuinely gated — QuickSwitcher only mounts once Cmd+K fires. The
// other global surfaces (EventModal, TutorialOverlay, AmbientSoundDrawer,
// InstallPrompt) are eagerly imported above because wrapping them in a
// Suspense boundary at the layout level caused a perceived lag on every
// route change (the boundary re-evaluates even after chunks are cached).
const QuickSwitcher = lazy(() => import("@/components/docs/QuickSwitcher"));


const MOBILE_NAV_ITEMS = [
  {
    href: '/calendar',
    label: 'Calendar',
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    href: '/tasks',
    label: 'Tasks',
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="8" rx="1"/>
      </svg>
    ),
  },
  {
    href: '/plan',
    label: 'Plan',
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="4" x2="9" y2="2" /><line x1="15" y1="4" x2="15" y2="2" />
      </svg>
    ),
  },
  {
    href: '/pomodoro',
    label: 'Focus',
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
] as const;

const MORE_MENU_ITEMS = [
  {
    href: '/goals',
    label: 'Goals',
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
      </svg>
    ),
  },
  {
    href: '/performance',
    label: 'Performance',
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
  },
  {
    href: '/shop',
    label: 'Shop',
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
      </svg>
    ),
  },
  {
    href: '/intelligence',
    label: 'Insights',
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="12" r="10"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
  },
  {
    href: '/docs',
    label: 'Docs',
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="13" x2="15" y2="13"/>
        <line x1="9" y1="17" x2="13" y2="17"/>
      </svg>
    ),
  },
  {
    href: '/focus',
    label: 'Focus Timer',
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
    ),
  },
] as const;

/* ─── Reads ?connected= after OAuth redirect and fires a branded Sonner toast ───── */
function OAuthRedirectToast() {
  const searchParams = useSearchParams();
  useEffect(() => {
    const connected = searchParams.get('connected');
    if (!connected) return;

    // Strip param from URL without triggering navigation
    const url = new URL(window.location.href);
    url.searchParams.delete('connected');
    window.history.replaceState({}, '', url.pathname + (url.search || ''));

    if (connected === 'outlook') {
      toast(
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <OutlookProviderIcon size={22} className="shrink-0" />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Outlook connected</div>
            <div style={{ fontSize: 11, opacity: 0.65, marginTop: 1 }}>Your calendar is now synced</div>
          </div>
        </div>,
        {
          duration: 4500,
          style: { borderLeftColor: '#0277bd', borderLeftWidth: '3px', borderLeftStyle: 'solid' },
        }
      );
    } else if (connected === 'google') {
      toast(
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <GoogleProviderIcon size={22} className="shrink-0" />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Google Calendar connected</div>
            <div style={{ fontSize: 11, opacity: 0.65, marginTop: 1 }}>Events are now syncing</div>
          </div>
        </div>,
        {
          duration: 4500,
          style: { borderLeftColor: '#1a73e8', borderLeftWidth: '3px', borderLeftStyle: 'solid' },
        }
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const onboardingCompleted = useOnboardingStore((s) => s.completed);
  const onboardingHydrated = useOnboardingHydrated();
  const isGuest = useGuestStore((s) => s.isGuest);
  const pendingTaskCompletion = useLinkStore((s) => s.pendingTaskCompletion);
  const confirmTaskCompletion = useLinkStore((s) => s.confirmTaskCompletion);
  const dismissPrompt = useLinkStore((s) => s.dismissPrompt);
  const eventsHydrated = useCalendarEventsStore((s) => s.dbHydrated);
  const tasksHydrated = useTaskBoardStore((s) => s.dbHydrated);
  const focusHydrated = useFocusStore((s) => s.dbHydrated);
  // Safety-net: even if a hydration fetch hangs (slow network, never-resolving
  // promise), the global z-9999 overlay must dismiss within 3 seconds so the
  // user can interact with whatever has hydrated. Hard cap on UX wait time.
  const [hydrationTimeoutFired, setHydrationTimeoutFired] = useState(false);
  useEffect(() => {
    if (hydrationTimeoutFired) return;
    const t = setTimeout(() => setHydrationTimeoutFired(true), 3000);
    return () => clearTimeout(t);
  }, [hydrationTimeoutFired]);
  const allHydrated = (eventsHydrated && tasksHydrated && focusHydrated) || hydrationTimeoutFired;
  const router = useRouter();
  const pathname = usePathname();

  // Per-field selectors — subscribing to the whole store via `useStore()`
  // causes a re-render on every state change (current date, view, tab,
  // focus mode, etc.) which cascades into every child and shows up as
  // perceived route-change lag. Individual selectors stay stable.
  const openModal            = useCalendarStore((s) => s.openModal);
  const calculateIntelligence = useCalendarStore((s) => s.calculateIntelligence);
  const isFocusMode          = useCalendarStore((s) => s.isFocusMode);
  const setFocusMode         = useCalendarStore((s) => s.setFocusMode);
  const setCurrentDate       = useCalendarStore((s) => s.setCurrentDate);
  const setView              = useCalendarStore((s) => s.setView);
  const setTab               = useCalendarStore((s) => s.setTab);
  const setSidebarCollapsed  = useCalendarStore((s) => s.setSidebarCollapsed);
  const undo = useCalendarEventsStore((s) => s.undo);
  const redo = useCalendarEventsStore((s) => s.redo);

  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  // Mobile sidebar drawer — completely separate state from the desktop
  // collapsed/expanded toggle. Closes automatically on route change.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // ── Auto-collapse the desktop sidebar at narrow laptop widths ────────────
  // Laptop band (1024-1399px): the calendar / kanban / planner all overflow
  // when the sidebar takes 288px, so collapse to icon mode (72px) for room.
  // Drawer band (<1024px): the sidebar is hidden behind the hamburger; force
  // it expanded so when the drawer opens it shows full nav, not the icon
  // strip. Wide band (≥1400px): expand if WE auto-collapsed it (never
  // overriding a deliberate chevron click is enforced by wasAutoCollapsedRef).
  const wasAutoCollapsedRef = useRef(false);
  useEffect(() => {
    const checkWidth = () => {
      const w = window.innerWidth;
      const isDrawer = w < 1024;
      const isLaptop = w >= 1024 && w < 1400;
      const collapsed = useCalendarStore.getState().isSidebarCollapsed;

      if (isDrawer && collapsed) {
        // Drawer band — the slide-in sidebar should show full nav.
        wasAutoCollapsedRef.current = false;
        setSidebarCollapsed(false);
      } else if (isLaptop && !collapsed) {
        wasAutoCollapsedRef.current = true;
        setSidebarCollapsed(true);
      } else if (!isDrawer && !isLaptop && collapsed && wasAutoCollapsedRef.current) {
        wasAutoCollapsedRef.current = false;
        setSidebarCollapsed(false);
      }
    };
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, [setSidebarCollapsed]);

  // Close the "More" sheet on route change
  useEffect(() => { setMobileMoreOpen(false); }, [pathname]);
  // Close the mobile sidebar drawer on route change too — tapping a nav item
  // in the drawer should navigate AND dismiss the overlay.
  useEffect(() => { setMobileSidebarOpen(false); }, [pathname]);

  useOutlookSync();

  useEffect(() => {
    calculateIntelligence();
  }, [calculateIntelligence]);

  useEffect(() => {
    // Wait until the persist middleware has read localStorage.
    // Without this guard the default `completed: false` fires a redirect
    // for a single frame even when onboarding was already done.
    if (!onboardingHydrated) return;

    // Skip onboarding redirect during `npx boneyard-js build` so the CLI can
    // snapshot Skeleton layouts on every route without an auth / onboarding wall.
    if (typeof window !== "undefined" && (window as unknown as { __BONEYARD_BUILD?: boolean }).__BONEYARD_BUILD) {
      return;
    }

    if (!onboardingCompleted && pathname !== "/onboarding") {
      router.replace("/onboarding");
    } else if (onboardingCompleted && pathname === "/onboarding") {
      router.replace("/calendar");
    }
  }, [onboardingHydrated, onboardingCompleted, pathname, router]);

  useEffect(() => {
    let gPending = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable) ||
        (e.target instanceof HTMLElement && e.target.closest('[contenteditable]'))
      )
        return;
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === "k") {
          e.preventDefault();
          useQuickCaptureStore.getState().toggle();
          return;
        }
        if (key === "z") {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        }
        return;
      }

      if (gPending) {
        gPending = false;
        if (gTimer) clearTimeout(gTimer);
        e.preventDefault();
        if (key === "c") router.push("/calendar");
        else if (key === "t") router.push("/tasks");
        else if (key === "p") router.push("/plan");
        else if (key === "r") router.push("/performance");
        else if (key === "f") router.push("/focus");
        else if (key === "i") router.push("/intelligence");
        return;
      }
      if (key === "g") {
        gPending = true;
        gTimer = setTimeout(() => {
          gPending = false;
        }, 600);
        return;
      }

      if (key === "n") {
        e.preventDefault();
        openModal();
      }
      if (key === "t") {
        e.preventDefault();
        setCurrentDate(new Date());
      }
      if (key === "f") {
        e.preventDefault();
        setFocusMode(!isFocusMode);
      }
      if (key === "p") {
        e.preventDefault();
        setTab("profile");
        router.push("/intelligence");
      }
      if (key === "c") {
        e.preventDefault();
        setTab("calendar");
        router.push("/calendar");
      }
      if (key === "m") setView(ViewType.MONTH);
      if (key === "w") setView(ViewType.WEEK);
      if (key === "d") setView(ViewType.DAY);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (gTimer) clearTimeout(gTimer);
    };
  }, [
    openModal,
    setCurrentDate,
    undo,
    redo,
    setTab,
    isFocusMode,
    setFocusMode,
    router,
    setView,
  ]);

  // Warn guest users before closing/refreshing the tab so they don't lose data.
  useEffect(() => {
    if (!isGuest) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers show their own generic message; the return value is ignored
      // but required by some older engines.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isGuest]);

  // Render nothing until onboarding hydration is confirmed.
  // This eliminates the one-frame flash of the app shell before the redirect fires.
  if (!onboardingHydrated) return null;

  return (
    <>
      {/* Hydration loading overlay — plain conditional render. We previously
          wrapped this in <AnimatePresence> with an `exit` opacity tween, but
          in some Framer Motion + React 19 + Strict-Mode combinations the
          exit phase never finalizes after a state-driven unmount, leaving
          the overlay pinned at opacity:1 forever. A direct unmount avoids
          that whole class of failure — the overlay disappears in one frame
          the moment allHydrated flips. */}
      {onboardingCompleted && !allHydrated && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background"
        >
            <div className="flex flex-col items-center gap-5">
              {/* Elegant spinning ring loader */}
              <div className="relative w-10 h-10">
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-primary/20"
                />
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                <motion.div
                  className="absolute inset-[6px] rounded-full border-[1.5px] border-transparent border-b-primary/50"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                />
              </div>
              <motion.p
                className="text-xs text-muted-foreground font-medium tracking-wide"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >

              </motion.p>
            </div>
          </motion.div>
        )}

      <div
        className="flex h-screen w-full bg-background overflow-hidden text-foreground antialiased"
        style={{ animation: 'appShellFadeIn 0.4s cubic-bezier(0.4,0,0.2,1) both' }}
      >
        <div className="hidden lg:flex lg:h-full">
          <Sidebar />
        </div>

        {/* Mobile / tablet sidebar drawer — slides in from the left under a
            backdrop. Hidden entirely on lg+ (the desktop sidebar above takes
            over). Always mounted; visibility + slide are driven by `animate`
            against `mobileSidebarOpen`. We avoid <AnimatePresence> here for
            the same reason as the hydration overlay above — exit phases get
            stuck under React 19 + Strict Mode and the drawer would never
            unmount. pointer-events:none when closed prevents the off-screen
            panel from intercepting clicks. */}
        <div
          className="lg:hidden fixed inset-0 z-[55] bg-black/50 transition-opacity duration-150"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
          style={{
            opacity: mobileSidebarOpen ? 1 : 0,
            pointerEvents: mobileSidebarOpen ? 'auto' : 'none',
          }}
        />
        <div
          role="dialog"
          aria-label="Navigation menu"
          aria-modal={mobileSidebarOpen}
          aria-hidden={!mobileSidebarOpen}
          className="lg:hidden fixed left-0 top-0 bottom-0 z-[60] w-[288px] flex transition-transform duration-300 ease-out"
          style={{
            transform: mobileSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
            pointerEvents: mobileSidebarOpen ? 'auto' : 'none',
          }}
        >
          <Sidebar />
        </div>

        <main className="flex-1 flex flex-col min-w-0 transition-all duration-500 overflow-y-auto no-scrollbar relative">
          {/* Tablet/mobile top bar with hamburger — gives access to the full
              sidebar (docs tree, contexts, profile) at widths where the
              desktop sidebar is hidden and the bottom nav only covers the
              5 primary destinations. */}
          <div className="lg:hidden sticky top-0 z-30 flex items-center gap-2 px-3 py-2 bg-background/85 backdrop-blur-md border-b border-border/50">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open navigation menu"
              className="flex h-9 w-9 min-h-9 min-w-9 items-center justify-center rounded-lg hover:bg-muted transition-colors"
            >
              <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
                <line x1="2" y1="4" x2="16" y2="4" />
                <line x1="2" y1="9" x2="16" y2="9" />
                <line x1="2" y1="14" x2="16" y2="14" />
              </svg>
            </button>
            <span className="font-logo text-base font-semibold text-foreground tracking-tight">Lumina</span>
          </div>

          <GuestBanner />
          <div className="w-full max-w-[1024px] min-[1800px]:max-w-[1280px] min-[1800px]:mx-auto flex-1 flex flex-col min-h-0 p-3 md:p-4 lg:px-8 lg:py-1.5 pt-2 pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-4 lg:pb-1.5 relative">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
        <EventModal />
        <SonnerToaster />
        {/* OAuthRedirectToast must be in Suspense — useSearchParams requirement */}
        <Suspense fallback={null}>
          <OAuthRedirectToast />
        </Suspense>
        {/* DB hydration — fetches canonical records once on mount */}
        <PersistenceBootstrap />
        <TutorialOverlay />
        <QuickCapture />
        <AmbientSoundDrawer />
        <FloatingAmbientPlayer />
        <PomodoroFloatingWidget />
        <InstallPrompt />
        <OfflineIndicator />

        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-t border-border pb-safe">
          <div className="grid grid-cols-5 px-1 pt-1.5 pb-1.5">
            {MOBILE_NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  className={`min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                    active
                      ? 'text-primary'
                      : 'text-muted-foreground active:text-foreground'
                  }`}
                  aria-label={item.label}
                >
                  <span className={`transition-transform ${active ? 'scale-110' : ''}`}>
                    {item.icon}
                  </span>
                  <span className={`text-[10px] font-medium leading-none tracking-wide ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
            {/* More menu button */}
            <button
              type="button"
              onClick={() => setMobileMoreOpen(prev => !prev)}
              className={`min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                mobileMoreOpen || MORE_MENU_ITEMS.some(i => i.href === pathname)
                  ? 'text-primary'
                  : 'text-muted-foreground active:text-foreground'
              }`}
              aria-label="More"
            >
              <span className={`transition-transform ${mobileMoreOpen ? 'scale-110' : ''}`}>
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
                </svg>
              </span>
              <span className={`text-[10px] font-medium leading-none tracking-wide ${mobileMoreOpen || MORE_MENU_ITEMS.some(i => i.href === pathname) ? 'text-primary' : 'text-muted-foreground'}`}>
                More
              </span>
            </button>
          </div>
        </nav>

        {/* Mobile "More" sheet */}
        <AnimatePresence>
          {mobileMoreOpen && (
            <>
              <motion.div
                className="md:hidden fixed inset-0 z-[49] bg-background/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={() => setMobileMoreOpen(false)}
              />
              <motion.div
                className="md:hidden fixed bottom-[68px] left-2 right-2 z-[49] bg-card border border-border rounded-2xl shadow-card-lift overflow-hidden pb-safe"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="grid grid-cols-3 gap-1 p-2">
                  {MORE_MENU_ITEMS.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch
                        onClick={() => setMobileMoreOpen(false)}
                        className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl transition-all ${
                          active
                            ? 'text-primary bg-primary/5'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 active:bg-muted/60'
                        }`}
                      >
                        {item.icon}
                        <span className={`text-[11px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Quick Switcher (Cmd+K) — only mount once opened */}
      <Suspense fallback={null}>
        {quickSwitcherOpen && (
          <QuickSwitcher open={quickSwitcherOpen} onOpenChange={setQuickSwitcherOpen} />
        )}
      </Suspense>

      {/* Task completion prompt — shown when linked event is marked complete */}
      <AnimatePresence>
        {pendingTaskCompletion && (
          <TaskCompletionPrompt
            key={pendingTaskCompletion.taskId}
            taskId={pendingTaskCompletion.taskId}
            taskTitle={pendingTaskCompletion.taskTitle}
            onConfirm={confirmTaskCompletion}
            onDismiss={dismissPrompt}
          />
        )}
      </AnimatePresence>
    </>
  );
}
