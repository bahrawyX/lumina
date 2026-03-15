interface RequireAuthOptions {
  isAuthenticated: boolean;
  redirectTo?: string;
  onUnauthenticated?: (redirectTo: string) => void;
}

/**
 * Framework-agnostic auth guard helper.
 * Call this in route-level logic to centralize auth redirects.
 */
export function requireAuth({
  isAuthenticated,
  redirectTo = '/login',
  onUnauthenticated,
}: RequireAuthOptions): boolean {
  if (isAuthenticated) return true;
  onUnauthenticated?.(redirectTo);
  return false;
}
