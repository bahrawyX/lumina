'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

interface GuestUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  /** Short description of the gated feature, e.g. "Calendar sync". */
  featureName?: string;
}

/**
 * Modal shown when a guest user attempts to access an account-gated feature.
 * Offers a direct path to create an account or dismisses to continue as guest.
 */
export const GuestUpgradeModal: React.FC<GuestUpgradeModalProps> = ({
  open,
  onClose,
  featureName,
}) => (
  <AnimatePresence>
    {open && (
      <>
        {/* Backdrop */}
        <motion.div
          key="guest-upgrade-backdrop"
          className="fixed inset-0 z-[300] bg-black/35 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          aria-hidden
        />

        {/* Dialog */}
        <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none">
          <motion.div
            key="guest-upgrade-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Account required"
            className="pointer-events-auto w-full max-w-sm bg-card border border-border/60 rounded-2xl shadow-xl overflow-hidden"
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top accent line */}
            <div className="h-px bg-border/60" />

            <div className="p-6 space-y-4">
              {/* Header */}
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold text-foreground tracking-tight">
                  Account required
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {featureName
                    ? <><span className="font-medium text-foreground">{featureName}</span> requires a Lumina account.</>
                    : 'This feature requires a Lumina account.'}
                  {' '}Sign up free — the tasks, events and documents from this
                  guest session are imported into your new account.
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-1">
                {/* F2.3: went to `/onboarding` while `GuestBanner`'s CTA went
                    to `/auth/signin` — same intent, two destinations. */}
                <Link
                  href="/auth/signin?mode=signup"
                  className="w-full text-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Create free account
                </Link>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-lg border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  Continue as guest
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </>
    )}
  </AnimatePresence>
);
