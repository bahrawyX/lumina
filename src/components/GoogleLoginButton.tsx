"use client";

import { useState } from "react";
import { useLuminaAuthClient } from "@/components/AuthProvider";

type GoogleLoginButtonProps = {
  callbackURL?: string;
  className?: string;
  label?: string;
};

export default function GoogleLoginButton({
  callbackURL = "/auth-test",
  className,
  label = "Sign In with Google",
}: GoogleLoginButtonProps) {
  const authClient = useLuminaAuthClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const socialSignIn = (authClient.signIn as any)?.social;
      if (typeof socialSignIn !== "function") {
        setError("Google sign-in is unavailable in this client build.");
        return;
      }

      const result = await socialSignIn({
        provider: "google",
        callbackURL,
      });

      if (result?.error) {
        setError(result.error.message ?? "Google sign-in failed.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isLoading}
        className={className ?? "rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"}
      >
        {isLoading ? "Redirecting to Google..." : label}
      </button>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
