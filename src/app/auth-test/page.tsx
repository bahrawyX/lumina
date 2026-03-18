"use client";

import { useCallback, useMemo, useState } from "react";
import { useLuminaAuthClient } from "@/components/AuthProvider";
import GoogleLoginButton from "@/components/GoogleLoginButton";
import MicrosoftLoginButton from "@/components/MicrosoftLoginButton";

export default function AuthTestPage() {
  const authClient = useLuminaAuthClient();
  const { data, isPending, isRefetching, error, refetch } = authClient.useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busyAction, setBusyAction] = useState<"signup" | "signin" | "signout" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const user = data?.user ?? null;
  const session = data?.session ?? null;

  const status = useMemo(() => {
    if (isPending) return "loading";
    if (user && session) return "logged in";
    return "logged out";
  }, [isPending, user, session]);

  const clearMessage = useCallback(() => setMessage(null), []);

  const handleSignUp = useCallback(async () => {
    clearMessage();
    setBusyAction("signup");

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const fallbackName = normalizedEmail.split("@")[0] || "Lumina User";

      const result = await authClient.signUp.email({
        email: normalizedEmail,
        password,
        name: fallbackName,
        callbackURL: "/auth-test",
      });

      if (result.error) {
        setMessage(result.error.message ?? "Sign up failed");
        return;
      }

      await refetch();
      setMessage("Sign up successful");
    } finally {
      setBusyAction(null);
    }
  }, [authClient, clearMessage, email, password, refetch]);

  const handleSignIn = useCallback(async () => {
    clearMessage();
    setBusyAction("signin");

    try {
      const result = await authClient.signIn.email({
        email: email.trim().toLowerCase(),
        password,
        callbackURL: "/auth-test",
      });

      if (result.error) {
        setMessage(result.error.message ?? "Sign in failed");
        return;
      }

      await refetch();
      setMessage("Sign in successful");
    } finally {
      setBusyAction(null);
    }
  }, [authClient, clearMessage, email, password, refetch]);

  const handleSignOut = useCallback(async () => {
    clearMessage();
    setBusyAction("signout");

    try {
      const result = await authClient.signOut();
      if (result.error) {
        setMessage(result.error.message ?? "Sign out failed");
        return;
      }

      await refetch();
      setMessage("Signed out");
    } finally {
      setBusyAction(null);
    }
  }, [authClient, clearMessage, refetch]);

  const isBusy = busyAction !== null || isRefetching;

  return (
    <main className="mx-auto max-w-2xl p-6 md:p-10 space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Auth Test Page</h1>

      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <p className="text-sm text-muted-foreground">Session Status</p>
        <p className="text-base font-medium">
          Session: {status}
          {isRefetching ? " (refreshing...)" : ""}
        </p>
      </div>

      {status !== "logged in" ? (
        <section className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="space-y-2">
            <label htmlFor="auth-test-email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="auth-test-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="auth-test-password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="auth-test-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSignUp}
              disabled={isBusy || !email || !password}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              {busyAction === "signup" ? "Signing Up..." : "Sign Up"}
            </button>
            <button
              type="button"
              onClick={handleSignIn}
              disabled={isBusy || !email || !password}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              {busyAction === "signin" ? "Signing In..." : "Sign In"}
            </button>
          </div>

          <GoogleLoginButton callbackURL="/auth-test" />
          <MicrosoftLoginButton callbackURL="/auth-test" />
        </section>
      ) : (
        <section className="rounded-lg border border-border bg-card p-4 space-y-4">
          <p className="text-sm">
            Logged in as: <span className="font-medium">{user?.email ?? "unknown"}</span>
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isBusy}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            {busyAction === "signout" ? "Signing Out..." : "Logout"}
          </button>
        </section>
      )}

      {(message || error) && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
          {message ? <p>{message}</p> : null}
          {error ? <p className="text-red-500">{error.message}</p> : null}
        </div>
      )}

      <section className="rounded-lg border border-border bg-card p-4 space-y-2">
        <p className="text-sm text-muted-foreground">Raw session payload</p>
        <pre className="max-h-80 overflow-auto rounded-md bg-background p-3 text-xs leading-5">
          {JSON.stringify({ data, status, isPending, isRefetching, error: error?.message ?? null }, null, 2)}
        </pre>
      </section>
    </main>
  );
}
