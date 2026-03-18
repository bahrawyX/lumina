import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { integrations } from '@/db/schema';

const MS_TOKEN_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const STATE_COOKIE = 'lumina_microsoft_connect_state';
const CALENDAR_SCOPE =
  'openid offline_access https://graph.microsoft.com/Calendars.Read';

/**
 * GET /api/integrations/microsoft/callback
 *
 * Microsoft OAuth callback for the Outlook Calendar integration (NOT login).
 * Exchanges the authorization code for tokens and stores them in the
 * integrations table, keyed strictly to the authenticated user.
 *
 * MANUAL PREREQUISITE: Register `{BETTER_AUTH_URL}/api/integrations/microsoft/callback`
 * as a redirect URI in your Azure AD app registration.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  const baseURL = process.env.BETTER_AUTH_URL ?? new URL(req.url).origin;
  const errorRedirect = `${baseURL}/auth/popup-complete?provider=microsoft&error=true`;

  if (!session?.user?.id) {
    return NextResponse.redirect(errorRedirect);
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  if (errorParam) {
    return NextResponse.redirect(`${errorRedirect}&detail=${encodeURIComponent(errorParam)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${errorRedirect}&detail=missing_params`);
  }

  // Verify CSRF state against the httpOnly cookie set by /connect
  const cookieStore = await cookies();
  const storedState = cookieStore.get(STATE_COOKIE)?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(`${errorRedirect}&detail=state_mismatch`);
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(errorRedirect);
  }

  try {
    // Exchange authorization code for tokens
    const tokenRes = await fetch(MS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${baseURL}/api/integrations/microsoft/callback`,
        grant_type: 'authorization_code',
        scope: CALENDAR_SCOPE,
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error('[microsoft/callback] Token exchange failed:', body);
      return NextResponse.redirect(errorRedirect);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };

    if (!tokenData.access_token) {
      return NextResponse.redirect(errorRedirect);
    }

    const db = getDatabase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (tokenData.expires_in ?? 3600) * 1000);

    // Preserve the existing refresh token if Microsoft doesn't return a new one
    let refreshToken = tokenData.refresh_token;
    if (!refreshToken) {
      const [existing] = await db
        .select({ refreshToken: integrations.refreshToken })
        .from(integrations)
        .where(
          and(
            eq(integrations.userId, session.user.id),
            eq(integrations.provider, 'microsoft'),
          ),
        )
        .limit(1);
      refreshToken = existing?.refreshToken ?? '';
    }

    await db
      .insert(integrations)
      .values({
        userId: session.user.id,
        provider: 'microsoft',
        accessToken: tokenData.access_token,
        refreshToken,
        expiresAt,
        scope: tokenData.scope ?? CALENDAR_SCOPE,
        tokenType: tokenData.token_type ?? 'Bearer',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [integrations.userId, integrations.provider],
        set: {
          accessToken: tokenData.access_token,
          refreshToken,
          expiresAt,
          scope: tokenData.scope ?? CALENDAR_SCOPE,
          status: 'active',
          updatedAt: now,
        },
      });

    // Clear CSRF state cookie, hand off to popup-complete page
    const response = NextResponse.redirect(
      `${baseURL}/auth/popup-complete?provider=microsoft`,
    );
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (err) {
    console.error('[microsoft/callback] Unexpected error:', err);
    return NextResponse.redirect(errorRedirect);
  }
}
