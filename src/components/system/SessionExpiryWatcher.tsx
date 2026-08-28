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
/**
 * The account this browser last held data for, across restarts.
 *
 * Written by `PersistenceBootstrap`'s cross-user guard and kept by
 * `clearLuminaStorage` (see `PRESERVE_ON_CLEAR`). It holds an opaque id and no
 * user data.
 */
const STORED_USER_ID_KEY = 'lumina-user-id';

function readStoredUserId(): string | null {
  try {
    return localStorage.getItem(STORED_USER_ID_KEY);
  } catch {
    // Private mode, or storage disabled. Losing the wipe is worse than
    // throwing here would be, but there is nothing to fall back to.
    return null;
  }
}

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
    // No user. If we previously had one, the session was lost rather than never
    // established.
    //
    // F5.4: `lastKnownUserId` lives only in memory, so this was true ONLY when
    // the session died with the tab open. Close the browser after an expiry and
    // reopen it, and the store starts at `null` — the wipe never ran, and the
    // next person to open the browser saw the previous user's name, role, work
    // hours, timezone, focus goals and notification preferences rendered
    // straight out of localStorage. That is the exact scenario this watcher
    // exists for, and the one it could not see.
    //
    // `lumina-user-id` is the durable record: `PersistenceBootstrap` writes it
    // for every authenticated session and `PRESERVE_ON_CLEAR` deliberately
    // keeps it through a wipe, so it survives both the restart and the cleanup
    // it triggers.
    const rememberedUserId = lastKnownUserId ?? readStoredUserId();

    if (rememberedUserId && !expired) {
      markExpired();
      // Nothing on the device should still describe the departed user.
      clearLuminaStorage();
      router.refresh();
    }
  }, [session?.user?.id, isPending, router]);

  return null;
}
