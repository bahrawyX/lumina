import { create } from 'zustand';

/**
 * "The server says this session is no longer valid."
 *
 * `authClient.useSession()` does not poll — it resolves once per mount. So from
 * the moment a session becomes invalid with the tab open:
 *
 *   1. `useSession()` keeps returning the stale cached session object with
 *      `isPending: false` and `data.user.id` set. Nothing re-fetches.
 *   2. Every API call 401s. The persistence layer used to turn each 401 into an
 *      empty array, making it indistinguishable from "no data".
 *   3. Writes failed silently — `createOne` returned `null`, no toast, no
 *      rollback, and the task stayed on the board looking saved.
 *   4. The user saw nothing wrong. The only expiry-aware surface in the whole
 *      codebase was doc creation.
 *   5. On refresh they were silently downgraded to "guest", and everything
 *      typed since expiry was gone with no warning.
 *
 * This store is the missing signal. `SessionExpiryWatcher` feeds it from the
 * `apiClient` 401 interceptor and from the authenticated -> unauthenticated
 * session transition, and `SessionExpiredDialog` blocks further work until the
 * user signs in again.
 */
interface SessionState {
  /** True once the server has told us the session is gone. */
  expired: boolean;
  /** The user id we last saw authenticated, for cross-user wipe decisions. */
  lastKnownUserId: string | null;

  markExpired: () => void;
  markActive: (userId: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  expired: false,
  lastKnownUserId: null,

  markExpired: () => set({ expired: true }),
  markActive: (userId) => set({ expired: false, lastKnownUserId: userId }),
}));

/**
 * Read the expiry flag imperatively.
 *
 * Write paths call this before issuing a mutation: once the session is known to
 * be gone, an optimistic update that can never be persisted is worse than a
 * refusal, because the user keeps working on state that will vanish on reload.
 */
export function isSessionExpired(): boolean {
  return useSessionStore.getState().expired;
}
