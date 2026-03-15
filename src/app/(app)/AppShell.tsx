"use client";

import React, { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
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
          toastOptions={{ classNames: { toast: "font-sans text-sm" } }}
        />
      </motion.div>
    </>
  );
}
