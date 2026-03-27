"use client";

import React, { useEffect, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Sidebar from "@/components/Sidebar";
import EventModal from "@/components/EventModal";
import TimerCallout from "@/components/TimerCallout";
import Toaster from "@/components/ui/Toaster";
import { motion } from "framer-motion";
import { Toaster as SonnerToaster } from "sonner";
import { useCalendarStore } from "@/store/useCalendarStore";
import { useCalendarEventsStore } from "@/store/useCalendarEventsStore";
import { useOnboardingStore, useOnboardingHydrated } from "@/store/useOnboardingStore";
import { useOutlookSync } from "@/hooks/useOutlookSync";
import PersistenceBootstrap from "@/components/PersistenceBootstrap";
import { GoogleProviderIcon, OutlookProviderIcon } from "@/components/icons";

const MOBILE_NAV_ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/plan', label: 'Plan' },
  { href: '/performance', label: 'Stats' },
  { href: '/focus', label: 'Focus' },
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
  const router = useRouter();
  const pathname = usePathname();

  const {
    openModal,
    calculateIntelligence,
    isFocusMode,
    setFocusMode,
    setCurrentDate,
    setView,
    setTab,
  } = useCalendarStore();
  const { undo, redo } = useCalendarEventsStore();

  useOutlookSync();

  useEffect(() => {
    calculateIntelligence();
  }, [calculateIntelligence]);

  useEffect(() => {
    // Wait until the persist middleware has read localStorage.
    // Without this guard the default `completed: false` fires a redirect
    // for a single frame even when onboarding was already done.
    if (!onboardingHydrated) return;

    if (!onboardingCompleted && pathname !== "/onboarding") {
      router.replace("/onboarding");
    } else if (onboardingCompleted && pathname === "/onboarding") {
      router.replace("/");
    }
  }, [onboardingHydrated, onboardingCompleted, pathname, router]);

  useEffect(() => {
    let gPending = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
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
        if (key === "c") router.push("/");
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
        router.push("/");
      }
      if (key === "m") setView("month" as any);
      if (key === "w") setView("week" as any);
      if (key === "d") setView("day" as any);
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

  // Render nothing until onboarding hydration is confirmed.
  // This eliminates the one-frame flash of the app shell before the redirect fires.
  if (!onboardingHydrated) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="flex h-screen w-full bg-warm-50 dark:bg-neutral-dark overflow-hidden text-gray-800 dark:text-gray-100 antialiased selection:bg-primary selection:text-white"
      >
        <div className="hidden md:flex md:h-full">
          <Sidebar />
        </div>
        <main className="flex-1 flex flex-col min-w-0 transition-all duration-500 overflow-hidden relative">
          <div className="w-full max-w-[1280px] mx-auto flex-1 flex flex-col min-h-0 p-3 md:p-4 lg:p-10 pt-safe pb-[calc(env(safe-area-inset-bottom)+80px)] md:pb-0 relative">
            {children}
          </div>
        </main>
        <TimerCallout />
        <EventModal />
        <Toaster />
        <SonnerToaster
          position="bottom-right"
          offset={20}
          gap={8}
          toastOptions={{
            unstyled: false,
            classNames: {
              toast: 'font-sans text-[13px]',
            },
          }}
        />
        {/* OAuthRedirectToast must be in Suspense — useSearchParams requirement */}
        <Suspense fallback={null}>
          <OAuthRedirectToast />
        </Suspense>
        {/* DB hydration — fetches canonical records once on mount */}
        <PersistenceBootstrap />

        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/50 backdrop-blur-lg border-t border-white/10 pb-safe">
          <div className="grid grid-cols-5 px-2 pt-2 pb-2">
            {MOBILE_NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => router.push(item.href)}
                  className={`min-h-11 rounded-xl text-[11px] font-semibold transition-colors ${active ? 'text-white bg-white/12' : 'text-white/70 hover:text-white hover:bg-white/8'}`}
                  aria-label={item.label}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>
      </motion.div>
    </>
  );
}
