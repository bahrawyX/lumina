"use client";

import { useEffect } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { LuminaAuthProvider } from "@/components/AuthProvider";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // One-time cleanup of pre-BetterAuth localStorage keys (safe to keep indefinitely).
    localStorage.removeItem("lumina_outlook_token");
    localStorage.removeItem("lumina_outlook_account");
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
      storageKey="lumina-theme"
    >
      <LuminaAuthProvider>
        <TooltipProvider delayDuration={400}>{children}</TooltipProvider>
      </LuminaAuthProvider>
    </ThemeProvider>
  );
}
