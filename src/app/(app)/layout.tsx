import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { users } from "@/db/schema";
import { AppShell } from "./AppShell";

export const metadata: Metadata = {
  robots: "noindex, nofollow",
};

/**
 * P1-15(a): this was a synchronous passthrough that read nothing.
 *
 * Everything the app knew about the current user arrived on the client, after
 * hydration, via `authClient.useSession()`. Until that resolved, `AppShell` had
 * to *assume* a session existed — which is why the blocking hydration overlay
 * was gated on a guess, and why F5.6 could show a full-screen spinner to a
 * signed-out visitor in the first place.
 *
 * The session cookie is readable here, during SSR, before a byte reaches the
 * browser. Reading it costs one query on a request that is already dynamic (the
 * proxy checks the same cookie a moment earlier) and turns the shell's opening
 * question from a guess into a fact.
 *
 * ## What this deliberately does NOT do
 *
 * P1-15(a) also asks for the domain data — events, tasks, focus sessions — to
 * be fetched server-side so the client bundle stops shipping a fetch-and-
 * hydrate layer for all of it. That is a genuine rewrite of
 * `PersistenceBootstrap` and the stores it feeds, not a change to this file,
 * and it is still open. This closes the session half, which is the half the
 * overlay and the first paint depend on.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // `headers()` makes this route dynamic — which it already was, since every
  // page under `(app)` is per-user and the proxy gates it on the same cookie.
  const session = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null);

  /**
   * Whether this ACCOUNT has finished onboarding, resolved on the server.
   *
   * The redirect gate in `AppShell` used to decide this from localStorage
   * alone, which is wrong twice over for a returning user on a clean browser:
   *
   *  - localStorage says `completed: false` (there is nothing in it), so they
   *    were bounced to `/onboarding` despite having onboarded long ago;
   *  - and because the gate only waits for the localStorage read, the redirect
   *    fired after the calendar had already painted — the flash of the app
   *    before being thrown into onboarding.
   *
   * `onboarding_completed_at` is the account-level record. Reading it here
   * makes the answer available before the first byte, so there is nothing to
   * flash and nobody to misroute.
   */
  let onboardingCompleted = false;
  if (session?.user?.id) {
    try {
      const [row] = await getDatabase()
        .select({ at: users.onboardingCompletedAt })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1);
      onboardingCompleted = row?.at != null;
    } catch {
      // A failed read must not wall the app off. `false` sends them to
      // onboarding, which is recoverable; throwing here is not.
      onboardingCompleted = false;
    }
  }

  return (
    <AppShell
      initialHasSession={Boolean(session?.user)}
      initialOnboardingCompleted={onboardingCompleted}
    >
      {children}
    </AppShell>
  );
}
