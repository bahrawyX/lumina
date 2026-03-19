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
 * Source of truth:
 *   integrations table only (created by OAuth callback flow).
 *
 * refreshToken is never returned to callers — only accessToken is exposed.
 */
export async function getGoogleAccessToken(userId: string): Promise<string> {
  const db = getDatabase();
  const now = new Date();

  // ── Check integrations table ───────────────────────────────────────────────
  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, 'google')))
    .limit(1);

  if (!integration) {
    throw new Error('No Google integration found. Connect Google Calendar first.');
  }

  if (integration.status !== 'active') {
    throw new Error('Google integration is not active.');
  }

  // Token is still valid (60 s buffer)
  if (integration.expiresAt > new Date(now.getTime() + 60_000)) {
    return integration.accessToken;
  }

  // Refresh the expired token
  if (!integration.refreshToken) {
    throw new Error('Google refresh token missing. Please reconnect Google Calendar.');
  }

  const { accessToken, expiresAt } = await refreshGoogleToken(integration.refreshToken);

  await db
    .update(integrations)
    .set({ accessToken, expiresAt, status: 'active', updatedAt: now })
    .where(and(eq(integrations.userId, userId), eq(integrations.provider, 'google')));

  return accessToken;
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
