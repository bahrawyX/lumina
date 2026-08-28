'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useGuestStore } from '@/store/useGuestStore';

/**
 * Slim top-of-content warning shown while the user operates in guest mode.
 * Dismissible — dismissal is persisted so it doesn't reappear on refresh.
 * Links to the shared auth form (sign-up tab) to convert the guest.
 */
export const GuestBanner: React.FC = () => {
  const isGuest = useGuestStore((s) => s.isGuest);
  const bannerDismissed = useGuestStore((s) => s.bannerDismissed);
  const dismissBanner = useGuestStore((s) => s.dismissBanner);

  return (
    <AnimatePresence>
      {isGuest && !bannerDismissed && (
        <motion.div
          key="guest-banner"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="absolute top-0 left-0 right-0 z-30"
        >
          <div className="flex items-center gap-3 px-4 py-2 border-b border-amber-200/70 dark:border-amber-800/35 bg-amber-50/95 dark:bg-amber-950/90 backdrop-blur-sm">
            {/* Icon */}
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>

            {/* Message */}
            <p className="text-xs text-amber-900 dark:text-amber-200 flex-1 leading-snug">
              <span className="font-semibold">Guest mode — </span>
              your tasks, events, plan and documents are saved in this browser only.
              They stay here across reloads, but are lost if you sign out, clear
              site data, or switch device or browser.{' '}
              {/* F2.3: this said "Create an account" and landed on the SIGN IN
                  tab, while `GuestUpgradeModal`'s equivalent CTA went to
                  `/onboarding` — same intent, two destinations, two different
                  forms. Both now open the same form on the tab the copy
                  promises, which F2.2's `?mode=` makes possible. */}
              <Link
                href="/auth/signin?mode=signup"
                className="font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity"
              >
                Create an account to save permanently →
              </Link>
            </p>

            {/* Dismiss */}
            <button
              type="button"
              onClick={dismissBanner}
              aria-label="Dismiss guest warning"
              className="flex-shrink-0 p-0.5 text-amber-600/50 dark:text-amber-400/50 hover:text-amber-900 dark:hover:text-amber-100 transition-colors"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
