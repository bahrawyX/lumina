import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { integrations } from '@/db/schema';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const STATE_COOKIE = 'lumina_google_connect_state';

/**
 * GET /api/integrations/google/callback
 *
 * Google OAuth callback for the calendar integration (NOT login).
 * Exchanges the authorization code for tokens and stores them in
 * the integrations table, keyed strictly to the authenticated user.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  const baseURL = process.env.BETTER_AUTH_URL ?? new URL(req.url).origin;
  const errorRedirect = `${baseURL}/auth/popup-complete?provider=google&error=true`;

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

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(errorRedirect);
  }

  try {
    // Exchange authorization code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${baseURL}/api/integrations/google/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error('[google/callback] Token exchange failed:', body);
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

    // If Google doesn't return a refresh token (user already consented before),
    // preserve the existing one so we don't break future token refreshes.
    let refreshToken = tokenData.refresh_token;
    if (!refreshToken) {
      const [existing] = await db
        .select({ refreshToken: integrations.refreshToken })
        .from(integrations)
        .where(
          and(eq(integrations.userId, session.user.id), eq(integrations.provider, 'google')),
        )
        .limit(1);
      refreshToken = existing?.refreshToken ?? '';
    }

    await db
      .insert(integrations)
      .values({
        userId: session.user.id,
        provider: 'google',
        accessToken: tokenData.access_token,
        refreshToken,
        expiresAt,
        scope: tokenData.scope ?? 'https://www.googleapis.com/auth/calendar.readonly',
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
          scope: tokenData.scope ?? 'https://www.googleapis.com/auth/calendar.readonly',
          status: 'active',
          updatedAt: now,
        },
      });

    // Clear the CSRF state cookie and hand off to the popup-complete page
    const response = NextResponse.redirect(`${baseURL}/auth/popup-complete?provider=google`);
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (err) {
    console.error('[google/callback] Unexpected error:', err);
    return NextResponse.redirect(errorRedirect);
  }
}
