import 'server-only';
import { and, eq, or } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { integrations } from '@/db/schema';

const MS_TOKEN_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const CALENDAR_SCOPE =
  'openid offline_access https://graph.microsoft.com/Calendars.Read';

/** Matches both 'microsoft' and legacy 'outlook' provider values. */
const providerClause = or(
  eq(integrations.provider, 'microsoft'),
  eq(integrations.provider, 'outlook'),
);

async function refreshMicrosoftToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      '[microsoft/token] MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET not set.',
    );
  }

  const res = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      scope: CALENDAR_SCOPE,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `[microsoft/token] Token refresh failed (${res.status}): ${body}`,
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
  };
}

export async function getMicrosoftAccessToken(userId: string): Promise<string> {
  const db = getDatabase();
  const now = new Date();

  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, userId), providerClause!))
    .limit(1);

  if (!integration) {
    throw new Error(
      'No Microsoft integration found. Connect Outlook Calendar first.',
    );
  }

  if (integration.status !== 'active') {
    throw new Error('Microsoft integration is not active.');
  }

  // Token is still valid (60 s buffer)
  if (integration.expiresAt > new Date(now.getTime() + 60_000)) {
    return integration.accessToken;
  }

  // Refresh the expired token
  if (!integration.refreshToken) {
    throw new Error(
      'Microsoft refresh token missing. Please reconnect Outlook Calendar.',
    );
  }

  const { accessToken, expiresAt } = await refreshMicrosoftToken(
    integration.refreshToken,
  );

  await db
    .update(integrations)
    .set({ accessToken, expiresAt, status: 'active', updatedAt: now })
    .where(and(eq(integrations.userId, userId), providerClause!));

  return accessToken;
}

export async function markMicrosoftIntegrationSynced(
  userId: string,
): Promise<void> {
  const db = getDatabase();
  await db
    .update(integrations)
    .set({ status: 'active', lastSyncAt: new Date(), updatedAt: new Date() })
    .where(and(eq(integrations.userId, userId), providerClause!));
}

export async function markMicrosoftIntegrationError(
  userId: string,
  message: string,
): Promise<void> {
  const db = getDatabase();
  await db
    .update(integrations)
    .set({ status: 'error', updatedAt: new Date() })
    .where(and(eq(integrations.userId, userId), providerClause!));

  if (process.env.NODE_ENV === 'development') {
    console.warn('[microsoft/token] Integration error:', message);
  }
}
