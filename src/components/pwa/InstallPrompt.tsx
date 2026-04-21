'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';

// ── Types ──────────────────────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// ── Storage keys ───────────────────────────────────────────────────────────
// Snooze holds an absolute timestamp (ms since epoch). If Date.now() < snooze,
// the prompt stays hidden. "Not now" writes now + 3 days. Installed is a
// permanent flag set on accept or on the window `appinstalled` event.

const SNOOZE_KEY = 'lumina-pwa-snoozed';
const INSTALLED_KEY = 'lumina-pwa-installed';
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
const DWELL_MS = 30 * 1000;
const MIN_ROUTES = 2;

// Stash the BIP event before React mounts — Chrome fires it early and will
// not fire again this session.
let deferredBip: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredBip = e as BeforeInstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    try { localStorage.setItem(INSTALLED_KEY, 'true'); } catch { /* ignore */ }
    deferredBip = null;
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem(INSTALLED_KEY) === 'true') return true;
  } catch { /* ignore */ }
  return false;
}

function isSnoozed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) return false;
    return Date.now() < until;
  } catch {
    return false;
  }
}

function snoozeFor3Days(): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch { /* ignore */ }
}

function markInstalled(): void {
  try {
    localStorage.setItem(INSTALLED_KEY, 'true');
  } catch { /* ignore */ }
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const pathname = usePathname();
  const routesSeen = useRef<Set<string>>(new Set());
  const mountedAt = useRef<number>(Date.now());
  const readyRef = useRef<boolean>(false);

  // Track distinct routes visited this session (for the "2+ routes" gate).
  useEffect(() => {
    if (pathname) routesSeen.current.add(pathname);
  }, [pathname]);

  useEffect(() => {
    // Eligibility gate — evaluated on mount and re-evaluated by tryShow().
    if (isInstalled()) return;
    if (isStandalone()) { markInstalled(); return; }
    if (isSnoozed()) return;

    // On iOS there's no beforeinstallprompt — show the Share-sheet guide once
    // the dwell/route threshold is met.
    const iOSReady = isIOS();

    const tryShow = () => {
      if (readyRef.current) return;
      if (isInstalled() || isStandalone() || isSnoozed()) return;
      const dwellOk = Date.now() - mountedAt.current >= DWELL_MS;
      const routesOk = routesSeen.current.size >= MIN_ROUTES;
      if (!dwellOk && !routesOk) return;

      if (iOSReady) {
        readyRef.current = true;
        setShowIOSGuide(true);
        setShow(true);
        return;
      }
      if (deferredBip) {
        readyRef.current = true;
        setShow(true);
      }
    };

    // Re-check on BIP, on dwell timeout, and on route changes.
    const onBip = (e: Event) => {
      e.preventDefault();
      deferredBip = e as BeforeInstallPromptEvent;
      tryShow();
    };
    const onInstalled = () => {
      markInstalled();
      deferredBip = null;
      setShow(false);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInstalled);
    const dwellTimer = window.setTimeout(tryShow, DWELL_MS);
    const routeTimer = window.setInterval(tryShow, 500);

    // First attempt immediately (covers reloads where BIP fired pre-mount
    // and the user already meets route/dwell criteria from a previous visit).
    tryShow();

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
      window.clearTimeout(dwellTimer);
      window.clearInterval(routeTimer);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    const bip = deferredBip;
    if (!bip) return;
    try {
      await bip.prompt();
      const { outcome } = await bip.userChoice;
      if (outcome === 'accepted') {
        markInstalled();
      } else {
        snoozeFor3Days();
      }
    } catch {
      snoozeFor3Days();
    }
    deferredBip = null;
    setShow(false);
  }, []);

  const handleSnooze = useCallback(() => {
    snoozeFor3Days();
    setShow(false);
  }, []);

  const handleIOSGotIt = useCallback(() => {
    snoozeFor3Days();
    setShow(false);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
          className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm"
        >
          <div className="rounded-2xl border border-border/60 bg-card shadow-xl p-4">
            {showIOSGuide ? (
              /* iOS Instructions */
              <>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Install Lumina</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Tap the share button{' '}
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
                      </svg>
                      {' '}in Safari, then select &quot;Add to Home Screen&quot;
                    </p>
                  </div>
                </div>
                <div className="flex justify-end mt-3">
                  <Button variant="ghost" size="sm" onClick={handleIOSGotIt}>
                    Got it
                  </Button>
                </div>
              </>
            ) : (
              /* Standard install prompt (Chrome/Edge) */
              <>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Install Lumina</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Add to your home screen for quick access and offline support
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <Button variant="ghost" size="sm" onClick={handleSnooze}>
                    Not now
                  </Button>
                  <Button size="sm" onClick={() => void handleInstall()}>
                    Install
                  </Button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
