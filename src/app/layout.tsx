import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Lumina Calendar",
  description: "Your intelligent productivity workspace",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Lumina",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#6D59E0",
    "msapplication-tap-highlight": "no",
  },
};

export const viewport: Viewport = {
  themeColor: "#6D59E0",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className="dark"
      data-mantine-color-scheme="dark"
      style={{ colorScheme: 'dark' }}
      suppressHydrationWarning
    >
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
        <link rel="preload" href="/animations/pomodoro-complete.json" as="fetch" crossOrigin="anonymous" />
        <link rel="preload" href="/animations/streak-fire.json" as="fetch" crossOrigin="anonymous" />
        {/* PWA: Apple touch icon */}
        <link rel="apple-touch-icon" href="/icons/pwa-192.png" />
      </head>
      <body className="bg-warm-50 dark:bg-neutral-dark text-gray-800 dark:text-gray-100">
        <Providers>{children}</Providers>
        {/* Service worker registration — production only */}
        {process.env.NODE_ENV === 'production' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if ('serviceWorker' in navigator) {
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js', { scope: '/' });
                  });
                }
              `,
            }}
          />
        )}
      </body>
    </html>
  );
}
