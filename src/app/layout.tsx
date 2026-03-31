import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Lumina Calendar",
  description: "High-performance calendar and planner application",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Preload frequently-used Lottie animations */}
        <link rel="preload" href="/animations/loading-pulse.json" as="fetch" crossOrigin="anonymous" />
        <link rel="preload" href="/animations/pomodoro-complete.json" as="fetch" crossOrigin="anonymous" />
        <link rel="preload" href="/animations/streak-fire.json" as="fetch" crossOrigin="anonymous" />
      </head>
      <body className="bg-warm-50 dark:bg-neutral-dark text-gray-800 dark:text-gray-100">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
