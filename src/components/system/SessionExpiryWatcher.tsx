'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { onUnauthorized } from '@/lib/persistence/apiClient';
import { useSessionStore } from '@/store/useSessionStore';
import { clearLuminaStorage } from '@/lib/storage';

/**
 * Detects session loss from two independent signals and reacts once.
 *
 * 1. **Any API call returning 401.** This is the only signal available while
 *    the tab stays open, because `useSession()` resolves once per mount and
 *    never re-polls — a session that dies mid-use leaves the cached session
 *    object in place indefinitely.
 * 2. **An authenticated -> unauthenticated transition** of the session query,
 *    which covers a reload after the cookie went away.
 *
 * On the second signal it also runs `clearLuminaStorage()`. The cross-user wipe
 * in `PersistenceBootstrap` bails early when there is no current user id, and
 * `clearLuminaStorage` otherwise only ran on an explicit sign-out click — so
 * when a session merely *expired*, nothing was wiped. The next person to open
 * the browser saw the previous user's name, role, work hours, timezone, focus
 * goals, notification preferences, pomodoro state and guest documents rendered
 * straight out of localStorage.
 */
export function SessionExpiryWatcher() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  // Signal 1 — a 401 from any API call.
  useEffect(() => {
    return onUnauthorized(() => {
      const { expired, markExpired } = useSessionStore.getState();
      if (expired) return;
      markExpired();
    });
  }, []);

  // Signal 2 — the session query going from a user to no user.
  useEffect(() => {
    if (isPending) return;
    const { lastKnownUserId, markActive, markExpired, expired } = useSessionStore.getState();
    const currentId = session?.user?.id ?? null;

    if (currentId) {
      markActive(currentId);
      return;
    }
    // No user. If we previously had one in this tab, the session was lost
    // rather than never established.
    if (lastKnownUserId && !expired) {
      markExpired();
      // Nothing on the device should still describe the departed user.
      clearLuminaStorage();
      router.refresh();
    }
  }, [session?.user?.id, isPending, router]);

  return null;
}
