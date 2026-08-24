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
): Promise<{ accessToken: string; expiresAt: Date; refreshToken: string | null }> {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      '[microsoft/token] MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET not set.',
    );
  }

  let res: Response;
  try {
    res = await fetch(MS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        scope: CALENDAR_SCOPE,
      }),
      // Bounded so a hung IdP can't pin the FOR UPDATE lock the caller holds
      // across this refresh. On timeout the caller's transaction rolls back.
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error('[microsoft/token] Token refresh timed out after 10s');
    }
    throw err;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `[microsoft/token] Token refresh failed (${res.status}): ${body}`,
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
  };
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    // P1-11: this field was FETCHED AND THROWN AWAY. The comment a few lines up
    // says "Microsoft ROTATES refresh tokens", and the response was then
    // destructured as `{ access_token, expires_in }` only.
    //
    // Because the stored refresh token never slid forward, EVERY Outlook
    // integration died at the original token's absolute expiry (~90 days) and
    // the user had to reconnect with no explanation. Google does not rotate, so
    // the identically-shaped Google path is benign.
    refreshToken: data.refresh_token ?? null,
  };
}

export async function getMicrosoftAccessToken(userId: string): Promise<string> {
  const db = getDatabase();
  const now = new Date();

  // ── Fast path: unlocked read ───────────────────────────────────────────────
  // The common case (token still valid) returns without taking a row lock, so
  // routine token reads don't serialize behind FOR UPDATE.
  const [current] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, userId), providerClause!))
    .limit(1);

  if (!current) {
    throw new Error(
      'No Microsoft integration found. Connect Outlook Calendar first.',
    );
  }
  if (current.status !== 'active') {
    throw new Error('Microsoft integration is not active.');
  }
  // Token is still valid (60 s buffer)
  if (current.expiresAt > new Date(now.getTime() + 60_000)) {
    return current.accessToken;
  }

  // ── Slow path: token expired → single-flight the refresh ────────────────────
  // Serialize concurrent refreshers on the integration row so the IdP refresh
  // happens EXACTLY ONCE. Microsoft ROTATES refresh tokens, so a second refresh
  // with the same token would leave the row holding a superseded token → 401s.
  // Same lock+re-check discipline the coin ledger uses.
  return db.transaction(async (tx) => {
    const [integration] = await tx
      .select()
      .from(integrations)
      .where(and(eq(integrations.userId, userId), providerClause!))
      .limit(1)
      .for('update');

    if (!integration) {
      throw new Error(
        'No Microsoft integration found. Connect Outlook Calendar first.',
      );
    }
    if (integration.status !== 'active') {
      throw new Error('Microsoft integration is not active.');
    }

    // Re-check AFTER acquiring the lock: another worker may have refreshed while
    // we waited, in which case the token is already fresh — do NOT refresh again
    // (that would burn the rotated refresh token).
    if (integration.expiresAt > new Date(Date.now() + 60_000)) {
      return integration.accessToken;
    }

    if (!integration.refreshToken) {
      throw new Error(
        'Microsoft refresh token missing. Please reconnect Outlook Calendar.',
      );
    }

    // Refresh runs while the row lock is held; it is bounded (AbortSignal.timeout
    // in refreshMicrosoftToken). If it throws (timeout or non-2xx), this callback
    // throws → the transaction rolls back → the lock releases and the row keeps
    // its previous (expired-but-intact) token, so a retry starts clean. The
    // UPDATE below runs only after a full, valid token is returned, so an aborted
    // refresh can never write a partial or empty token.
    const { accessToken, expiresAt, refreshToken: rotatedRefreshToken } =
      await refreshMicrosoftToken(integration.refreshToken);

    await tx
      .update(integrations)
      .set({
        accessToken,
        expiresAt,
        // P1-11: persist the ROTATED refresh token. This UPDATE previously set
        // accessToken/expiresAt/status/updatedAt and never refreshToken, so the
        // stored token never advanced and the integration expired for good at
        // the original token's absolute lifetime.
        //
        // `?? integration.refreshToken` covers a response that omits it — some
        // Entra configurations do not rotate — where keeping the existing token
        // is correct and overwriting with null would break the integration
        // immediately.
        refreshToken: rotatedRefreshToken ?? integration.refreshToken,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(and(eq(integrations.userId, userId), providerClause!));

    return accessToken;
  });
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
