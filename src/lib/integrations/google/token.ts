import 'server-only';
import { and, eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { accounts, integrations } from '@/db/schema';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

async function refreshGoogleToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('[google/token] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set');
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

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
 * Priority:
 *   1. integrations table (our canonical sync token store) — refresh if expired.
 *   2. accounts table (BetterAuth's row) — bootstrap integrations on first sync.
 *
 * The integrations row is upserted and kept in sync with the latest tokens.
 * refreshToken is never returned to callers — only accessToken is exposed.
 */
export async function getGoogleAccessToken(userId: string): Promise<string> {
  const db = getDatabase();
  const now = new Date();

  // ── 1. Check integrations table ─────────────────────────────────────────────
  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, 'google')))
    .limit(1);

  if (integration) {
    const isExpired = integration.expiresAt <= new Date(now.getTime() + 60_000);
    if (!isExpired) return integration.accessToken;

    // Token expired — refresh
    const { accessToken, expiresAt } = await refreshGoogleToken(integration.refreshToken);
    await db
      .update(integrations)
      .set({ accessToken, expiresAt, status: 'active', updatedAt: now })
      .where(and(eq(integrations.userId, userId), eq(integrations.provider, 'google')));

    return accessToken;
  }

  // ── 2. Bootstrap from BetterAuth accounts table ──────────────────────────────
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'google')))
    .limit(1);

  if (!account) {
    throw new Error(
      'No Google account linked. Sign in with Google to connect Google Calendar.',
    );
  }

  if (!account.accessToken || !account.refreshToken) {
    throw new Error(
      'Google account found but tokens are missing. ' +
        'Please sign out and sign back in with Google to grant calendar access.',
    );
  }

  let { accessToken } = account;
  let expiresAt = account.accessTokenExpiresAt ?? new Date(now.getTime() + 3_600_000);

  // Refresh if the access token from accounts is already expired
  if (expiresAt <= new Date(now.getTime() + 60_000)) {
    const refreshed = await refreshGoogleToken(account.refreshToken);
    accessToken = refreshed.accessToken;
    expiresAt = refreshed.expiresAt;
  }

  // Upsert integrations row — bootstrap from accounts
  await db
    .insert(integrations)
    .values({
      userId,
      provider: 'google',
      accessToken,
      refreshToken: account.refreshToken,
      expiresAt,
      scope: account.scope ?? null,
      tokenType: 'Bearer',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [integrations.userId, integrations.provider],
      set: {
        accessToken,
        expiresAt,
        scope: account.scope ?? null,
        status: 'active',
        updatedAt: now,
      },
    });

  return accessToken;
}

/** Mark the integration as errored (e.g. after a failed sync). */
export async function markIntegrationError(userId: string, message: string): Promise<void> {
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
export async function markIntegrationSynced(userId: string): Promise<void> {
  const db = getDatabase();
  await db
    .update(integrations)
    .set({ status: 'active', lastSyncAt: new Date(), updatedAt: new Date() })
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, 'google')));
}
