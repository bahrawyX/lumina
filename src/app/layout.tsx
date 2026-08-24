import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "./providers";
import { JsonLd } from "@/components/seo/JsonLd";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://lumina-six-bay.vercel.app'),
  title: {
    default: 'Lumina — Calendar, tasks, and focus in one place',
    template: '%s · Lumina',
  },
  description:
    'Lumina is a productivity workspace that combines calendar management, task kanban boards, daily planning, Pomodoro focus sessions, goal tracking, and AI-powered scheduling insights — all in one app.',
  applicationName: 'Lumina',
  keywords: [
    'productivity',
    'calendar',
    'task management',
    'pomodoro',
    'focus timer',
    'daily planner',
    'goal tracking',
    'AI scheduling',
  ],
  authors: [{ name: 'Abdelrahman El-Bahrawy' }],
  creator: 'Abdelrahman El-Bahrawy',
  publisher: 'Lumina',
  formatDetection: { email: false, address: false, telephone: false },
  category: 'productivity',
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Lumina',
    title: 'Lumina — Calendar, tasks, and focus in one place',
    description:
      'A productivity workspace combining calendar, tasks, focus sessions, goals, and AI scheduling insights.',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Lumina productivity workspace',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lumina — Calendar, tasks, and focus in one place',
    description:
      'A productivity workspace combining calendar, tasks, focus sessions, goals, and AI scheduling insights.',
    images: ['/og.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/pwa-192.png',
    other: [
      { rel: 'icon', url: '/icons/pwa-64.png', sizes: '64x64', type: 'image/png' },
      { rel: 'icon', url: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
      { rel: 'icon', url: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  alternates: { canonical: '/' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Lumina',
  },
  // Verification slots — uncomment when you have the codes
  // verification: {
  //   google: process.env.NEXT_PUBLIC_GSC_VERIFICATION,
  //   other: { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_VERIFICATION ?? '' },
  // },
  other: {
    'mobile-web-app-capable': 'yes',
    'msapplication-TileColor': '#6D59E0',
    'msapplication-tap-highlight': 'no',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8F6F2' },
    { media: '(prefers-color-scheme: dark)', color: '#131316' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
      style={{ colorScheme: 'dark' }}
      suppressHydrationWarning
    >
      <head>
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Lumina',
            applicationCategory: 'ProductivityApplication',
            operatingSystem: 'Web',
            description:
              'A productivity workspace combining calendar, tasks, focus sessions, goals, and AI scheduling insights.',
            url: process.env.NEXT_PUBLIC_APP_URL ?? 'https://lumina-six-bay.vercel.app',
            image: '/icons/pwa-512.png',
            author: {
              '@type': 'Person',
              name: 'Abdelrahman El-Bahrawy',
            },
          }}
        />
        {/* Route-specific Lottie preloads are declared in the pages that use them
            (FocusPage, PerformancePage, PomodoroView) to avoid wasted bandwidth on
            unrelated routes such as /tasks. */}
        {/* PWA: Apple touch icon */}
        <link rel="apple-touch-icon" href="/icons/pwa-192.png" />
        {/* Scroll-reveal elements start hidden and are revealed by framer-motion.
            `globals.css` covers this with `@media (scripting: none)`; this is the
            fallback for engines that don't support that media feature. */}
        <noscript>
          <style>{`[data-reveal],[data-reveal] *{opacity:1!important;filter:none!important;transform:none!important}`}</style>
        </noscript>
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
