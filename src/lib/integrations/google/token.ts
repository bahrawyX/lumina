import 'server-only';
import { and, eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { integrations } from '@/db/schema';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

async function refreshGoogleToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const clientId = process.env.GOOGLE_CLIENT_ID_CALENDAR;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET_CALENDAR;

  if (!clientId || !clientSecret) {
    throw new Error(
      '[google/token] GOOGLE_CLIENT_ID_CALENDAR / GOOGLE_CLIENT_SECRET_CALENDAR not set',
    );
  }

  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      // Bounded so a hung IdP can't pin the FOR UPDATE lock the caller holds
      // across this refresh. On timeout the caller's transaction rolls back.
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error('[google/token] Token refresh timed out after 10s');
    }
    throw err;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[google/token] Token refresh failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);
  return { accessToken: data.access_token, expiresAt };
}

/**
 * Returns a valid Google access token for the given userId.
 *
 * Source of truth:
 *   integrations table only (created by OAuth callback flow).
 *
 * refreshToken is never returned to callers — only accessToken is exposed.
 */
export async function getGoogleAccessToken(userId: string): Promise<string> {
  const db = getDatabase();
  const now = new Date();

  // ── Fast path: unlocked read ───────────────────────────────────────────────
  // The common case (token still valid) returns without taking a row lock, so
  // routine token reads don't serialize behind FOR UPDATE.
  const [current] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, 'google')))
    .limit(1);

  if (!current) {
    throw new Error('No Google integration found. Connect Google Calendar first.');
  }
  if (current.status !== 'active') {
    throw new Error('Google integration is not active.');
  }
  // Token is still valid (60 s buffer)
  if (current.expiresAt > new Date(now.getTime() + 60_000)) {
    return current.accessToken;
  }

  // ── Slow path: token expired → single-flight the refresh ────────────────────
  // Serialize concurrent refreshers on the integration row so the IdP refresh
  // happens EXACTLY ONCE. This is essential for providers with rotating refresh
  // tokens (Microsoft), where a second refresh with the same token would leave
  // the row holding a superseded token. Same lock+re-check discipline the coin
  // ledger uses (SELECT … FOR UPDATE, re-check after acquire).
  return db.transaction(async (tx) => {
    const [integration] = await tx
      .select()
      .from(integrations)
      .where(and(eq(integrations.userId, userId), eq(integrations.provider, 'google')))
      .limit(1)
      .for('update');

    if (!integration) {
      throw new Error('No Google integration found. Connect Google Calendar first.');
    }
    if (integration.status !== 'active') {
      throw new Error('Google integration is not active.');
    }

    // Re-check AFTER acquiring the lock: another worker may have refreshed while
    // we waited, in which case the token is already fresh — do NOT refresh again.
    if (integration.expiresAt > new Date(Date.now() + 60_000)) {
      return integration.accessToken;
    }

    if (!integration.refreshToken) {
      throw new Error('Google refresh token missing. Please reconnect Google Calendar.');
    }

    // Refresh runs while the row lock is held; it is bounded (AbortSignal.timeout
    // in refreshGoogleToken). If it throws (timeout or non-2xx), this callback
    // throws → the transaction rolls back → the lock releases and the row keeps
    // its previous (expired-but-intact) token, so a retry starts clean. The
    // UPDATE below runs only after a full, valid token is returned, so an aborted
    // refresh can never write a partial or empty token.
    const { accessToken, expiresAt } = await refreshGoogleToken(integration.refreshToken);

    await tx
      .update(integrations)
      .set({ accessToken, expiresAt, status: 'active', updatedAt: new Date() })
      .where(and(eq(integrations.userId, userId), eq(integrations.provider, 'google')));

    return accessToken;
  });
}

/** Mark the integration as errored (e.g. after a failed sync). */
export async function markGoogleIntegrationError(userId: string, message: string): Promise<void> {
  const db = getDatabase();
  await db
    .update(integrations)
    .set({ status: 'error', updatedAt: new Date() })
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, 'google')));

  if (process.env.NODE_ENV === 'development') {
    console.warn('[google/token] Integration error:', message);
  }
}

/** Mark the integration as successfully synced. */
export async function markGoogleIntegrationSynced(userId: string): Promise<void> {
  const db = getDatabase();
  await db
    .update(integrations)
    .set({ status: 'active', lastSyncAt: new Date(), updatedAt: new Date() })
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, 'google')));
}
