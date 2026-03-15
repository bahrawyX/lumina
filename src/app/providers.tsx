"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { LuminaAuthProvider } from "@/components/AuthProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MsalBootProvider } from "@/components/MsalBootProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
      storageKey="lumina-theme"
    >
      <MsalBootProvider>
        <LuminaAuthProvider>
          <TooltipProvider delayDuration={400}>{children}</TooltipProvider>
        </LuminaAuthProvider>
      </MsalBootProvider>
    </ThemeProvider>
  );
}
