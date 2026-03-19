import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { integrations } from '@/db/schema';
import { runFullGoogleSync } from '@/lib/integrations/google/sync';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * GET /api/integrations/google/callback
 *
 * Google OAuth callback for the calendar integration (NOT login).
 * Exchanges the authorization code for tokens and stores them in
 * the integrations table, keyed strictly to the authenticated user.
 */
export async function GET(req: NextRequest) {
  console.log('[GOOGLE CALLBACK] HIT');
  console.log('[GOOGLE CALLBACK] COOKIE HEADER:', req.headers.get('cookie'));
  console.log('[GOOGLE CALLBACK] HEADERS:', Object.fromEntries(req.headers.entries()));

  try {
    const baseURL = process.env.BETTER_AUTH_URL ?? new URL(req.url).origin;
    const expectedRedirect = `${baseURL}/api/integrations/google/callback`;

    console.log('[GOOGLE CALLBACK] BASE URL:', baseURL);
    console.log('[GOOGLE CALLBACK] EXPECTED REDIRECT:', expectedRedirect);
    console.log('[GOOGLE CALLBACK] CLIENT ID:', process.env.GOOGLE_CLIENT_ID_CALENDAR);
    console.log(
      '[GOOGLE CALLBACK] CLIENT SECRET EXISTS:',
      !!process.env.GOOGLE_CLIENT_SECRET_CALENDAR,
    );

    const { searchParams } = req.nextUrl;
    const code = searchParams.get('code');
    const rawState = searchParams.get('state');
    const errorParam = searchParams.get('error');

    console.log('[GOOGLE CALLBACK] CODE:', code);
    console.log('[GOOGLE CALLBACK] STATE:', rawState);

    if (errorParam) {
      return NextResponse.json(
        {
          error: 'GOOGLE_CALLBACK_FAILED',
          detail: `OAuth provider returned error param: ${errorParam}`,
        },
        { status: 400 },
      );
    }

    if (!code || !rawState) {
      return NextResponse.json(
        {
          error: 'GOOGLE_CALLBACK_FAILED',
          detail: 'Missing OAuth code or state.',
        },
        { status: 400 },
      );
    }

    let parsedState: { userId?: string };
    try {
      parsedState = JSON.parse(rawState) as { userId?: string };
    } catch {
      return NextResponse.json(
        {
          error: 'GOOGLE_CALLBACK_FAILED',
          detail: 'Invalid state format',
        },
        { status: 400 },
      );
    }

    const userId = parsedState.userId;
    console.log('[GOOGLE CALLBACK] USER ID FROM STATE:', userId);

    if (!userId) {
      return NextResponse.json(
        {
          error: 'GOOGLE_CALLBACK_FAILED',
          detail: 'Missing userId in state',
        },
        { status: 400 },
      );
    }

    console.log('[GOOGLE CALLBACK] STATE VALID');

    const clientId = process.env.GOOGLE_CLIENT_ID_CALENDAR;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET_CALENDAR;
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        {
          error: 'GOOGLE_CALLBACK_FAILED',
          detail: 'GOOGLE_CLIENT_ID_CALENDAR or GOOGLE_CLIENT_SECRET_CALENDAR is missing.',
        },
        { status: 500 },
      );
    }

    console.log('[GOOGLE CALLBACK] EXCHANGING TOKEN');

    // Exchange authorization code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: expectedRedirect,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error('[google/callback] Token exchange failed:', body);
      return NextResponse.json(
        {
          error: 'GOOGLE_CALLBACK_FAILED',
          detail: `Token exchange failed (${tokenRes.status}): ${body}`,
        },
        { status: 500 },
      );
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };

    console.log('[GOOGLE CALLBACK] TOKEN DATA:', tokenData);

    if (!tokenData.access_token) {
      return NextResponse.json(
        {
          error: 'GOOGLE_CALLBACK_FAILED',
          detail: 'Token response missing access_token.',
        },
        { status: 500 },
      );
    }

    console.info('[google/callback] Token exchange succeeded', {
      hasAccessToken: Boolean(tokenData.access_token),
      hasRefreshToken: Boolean(tokenData.refresh_token),
      scope: tokenData.scope ?? null,
    });

    const db = getDatabase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (tokenData.expires_in ?? 3600) * 1000);

    const [existing] = await db
      .select({ refreshToken: integrations.refreshToken })
      .from(integrations)
      .where(and(eq(integrations.userId, userId), eq(integrations.provider, 'google')))
      .limit(1);

    // If Google doesn't return a refresh token (user already consented before),
    // preserve the existing one so we don't break future token refreshes.
    const refreshToken = tokenData.refresh_token ?? existing?.refreshToken;

    console.log('[GOOGLE CALLBACK] FINAL REFRESH TOKEN:', refreshToken);

    if (!refreshToken) {
      console.error('[google/callback] Missing refresh token and no existing one');
      return NextResponse.json(
        {
          error: 'GOOGLE_CALLBACK_FAILED',
          detail: 'Missing refresh token and no existing one.',
        },
        { status: 500 },
      );
    }

    try {
      await db
        .insert(integrations)
        .values({
          userId,
          provider: 'google',
          accessToken: tokenData.access_token,
          refreshToken: refreshToken ?? existing?.refreshToken,
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
            refreshToken: refreshToken ?? existing?.refreshToken,
            expiresAt,
            scope: tokenData.scope ?? 'https://www.googleapis.com/auth/calendar.readonly',
            status: 'active',
            updatedAt: now,
          },
        });
    } catch (dbErr) {
      console.error('[google/callback] Failed to upsert integration row:', dbErr);
      return NextResponse.json(
        {
          error: 'GOOGLE_CALLBACK_FAILED',
          detail: `DB upsert failed: ${String(dbErr)}`,
        },
        { status: 500 },
      );
    }

    console.log('[GOOGLE CALLBACK] DB UPSERT DONE');

    console.info('[google/callback] Integration row upserted', {
      userId,
      provider: 'google',
      hasRefreshToken: Boolean(refreshToken),
    });

    console.log('[GOOGLE CALLBACK] STARTING SYNC');

    try {
      await runFullGoogleSync(userId);
    } catch (syncErr) {
      console.error('[google/callback] Full Google sync failed:', syncErr);
      return NextResponse.json(
        {
          error: 'GOOGLE_CALLBACK_FAILED',
          detail: `Google sync failed: ${String(syncErr)}`,
        },
        { status: 500 },
      );
    }

    console.log('[GOOGLE CALLBACK] SYNC DONE');

    // Hand off to the popup-complete page
    const response = NextResponse.redirect(`${baseURL}/auth/popup-complete?provider=google`);
    return response;
  } catch (error) {
    console.error('[GOOGLE CALLBACK ERROR]:', error);
    return NextResponse.json(
      {
        error: 'GOOGLE_CALLBACK_FAILED',
        detail: String(error),
      },
      { status: 500 },
    );
  }
}
