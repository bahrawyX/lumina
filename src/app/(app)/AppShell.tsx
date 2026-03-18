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
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { useOutlookSync } from "@/hooks/useOutlookSync";
import PersistenceBootstrap from "@/components/PersistenceBootstrap";

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
          <svg width="22" height="22" viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
            <path fill="#0277bd" d="M28.093 33H40c2.209 0 4-1.791 4-4V19c0-2.209-1.791-4-4-4H28.093v18z"/>
            <path fill="#03a9f4" d="M16 15L28.093 15 28.093 33 16 33z"/>
            <path fill="#4fc3f7" d="M28.093 20L38 20 38 28 28.093 28z"/>
            <path fill="#0288d1" d="M21 11H6c-2.209 0-4 1.791-4 4v18c0 2.209 1.791 4 4 4h15V11z"/>
            <path fill="#fff" d="M12.915 26.687c-2.31 0-3.921-1.666-3.921-4.062s1.583-4.103 3.935-4.103c2.31 0 3.894 1.638 3.894 4.075S15.225 26.687 12.915 26.687zM12.929 20.081c-1.391 0-2.233 1.055-2.233 2.544 0 1.502.828 2.502 2.219 2.502 1.405 0 2.219-1.027 2.219-2.516C15.134 21.08 14.334 20.081 12.929 20.081z"/>
          </svg>
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
          <svg width="22" height="22" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.591 4.418 1.582l3.491-3.49A11.932 11.932 0 0 0 12 0C7.27 0 3.198 2.698 1.24 6.65l4.026 3.115z" />
            <path fill="#34A853" d="M16.041 18.013A7.072 7.072 0 0 1 12 19.09c-2.973 0-5.535-1.853-6.6-4.487l-4.04 3.066C3.193 21.294 7.265 24 12 24c2.933 0 5.735-1.043 7.834-3.001l-3.793-2.986z" />
            <path fill="#4A90E2" d="M19.834 20.999C22.029 18.952 23.455 15.904 23.455 12c0-.71-.091-1.418-.273-2.09H12v4.545h6.436a5.463 5.463 0 0 1-1.638 2.902l3.036 2.642z" />
            <path fill="#FBBC05" d="M5.4 14.603A7.15 7.15 0 0 1 4.909 12c0-.56.076-1.104.214-1.624L1.24 7.26A11.981 11.981 0 0 0 0 12c0 1.92.444 3.73 1.237 5.335L5.4 14.603z" />
          </svg>
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
    if (!onboardingCompleted && pathname !== "/onboarding") {
      router.replace("/onboarding");
    } else if (onboardingCompleted && pathname === "/onboarding") {
      router.replace("/");
    }
  }, [onboardingCompleted, pathname, router]);

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

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="flex h-screen w-full bg-warm-50 dark:bg-neutral-dark overflow-hidden text-gray-800 dark:text-gray-100 antialiased selection:bg-primary selection:text-white"
      >
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 transition-all duration-500 overflow-hidden relative">
          <div className="w-full max-w-[1280px] mx-auto flex-1 flex flex-col min-h-0 p-3 md:p-4 lg:p-10 relative">
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
      </motion.div>
    </>
  );
}
