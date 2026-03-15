"use client";

import { createAuthClient } from "better-auth/react";

function resolveAuthBaseURL() {
  const configuredBase = process.env.NEXT_PUBLIC_BETTER_AUTH_URL;

  const fallbackOrigin =
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3000";

  const host = (configuredBase ?? fallbackOrigin).replace(/\/$/, "");
  return `${host}/api/auth`;
}

export const authClient = createAuthClient({
  baseURL: resolveAuthBaseURL(),
});
