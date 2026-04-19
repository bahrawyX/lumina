import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { integrations } from '@/db/schema';
import { runFullGoogleSync } from '@/lib/integrations/google/sync';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const STATE_COOKIE = 'lumina_google_connect_state';

/** Timing-safe string equality. Returns false for mismatched lengths. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

export async function handleGoogleConnect(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  const baseURL = process.env.BETTER_AUTH_URL ?? new URL(req.url).origin;

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID_CALENDAR;
  if (!clientId) {
    return NextResponse.json(
      { error: 'Google integration is not configured on this server.' },
      { status: 503 },
    );
  }

  // Use a cryptographically random state, stored in an httpOnly cookie and
  // verified on callback. Previously the state was `JSON.stringify({ userId })`
  // which is predictable and was never verified — the callback blindly trusted
  // whatever userId came back in the URL, allowing a malicious authorize URL
  // to redirect a victim through an attacker-chosen userId.
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseURL}/api/integrations/google/callback`,
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  const response = NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params}`);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60,
    path: '/',
  });
  return response;
}

export async function handleGoogleCallback(req: NextRequest) {
  const cookieStore = await cookies();
  const sessionHeaders = new Headers(req.headers);
  const cookieHeader = cookieStore.toString();
  if (cookieHeader) {
    sessionHeaders.set('cookie', cookieHeader);
  }

  const session = await auth.api.getSession({ headers: sessionHeaders });
  const baseURL = process.env.BETTER_AUTH_URL ?? new URL(req.url).origin;
  const errorRedirect = `${baseURL}/auth/popup-complete?provider=google&error=true`;

  // Require an authenticated session: the integration belongs to the current
  // user, not to whoever the OAuth flow claims.
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Unauthorized: no active session in Google callback.' },
      { status: 401 },
    );
  }

  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  if (errorParam) {
    return NextResponse.redirect(
      `${errorRedirect}&detail=${encodeURIComponent(errorParam)}`,
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(`${errorRedirect}&detail=missing_params`);
  }

  const storedState = cookieStore.get(STATE_COOKIE)?.value;
  if (!storedState || !safeEqual(storedState, state)) {
    return NextResponse.redirect(`${errorRedirect}&detail=state_mismatch`);
  }

  const userId = session.user.id;
  const clientId = process.env.GOOGLE_CLIENT_ID_CALENDAR;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET_CALENDAR;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(errorRedirect);
  }

  try {
    const expectedRedirect = `${baseURL}/api/integrations/google/callback`;
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
      // Log full error server-side; return generic error to the client so
      // we don't leak Google API internals.
      const body = await tokenRes.text();
      console.error('[google oauth] token exchange failed', {
        status: tokenRes.status,
        body,
      });
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
    const expiresAt = new Date(
      now.getTime() + (tokenData.expires_in ?? 3600) * 1000,
    );

    const [existing] = await db
      .select({ refreshToken: integrations.refreshToken })
      .from(integrations)
      .where(
        and(eq(integrations.userId, userId), eq(integrations.provider, 'google')),
      )
      .limit(1);

    const refreshToken = tokenData.refresh_token ?? existing?.refreshToken;
    if (!refreshToken) {
      return NextResponse.redirect(errorRedirect);
    }

    await db
      .insert(integrations)
      .values({
        userId,
        provider: 'google',
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

    await runFullGoogleSync(userId);

    const response = NextResponse.redirect(
      `${baseURL}/auth/popup-complete?provider=google`,
    );
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (error) {
    console.error('[google oauth] callback error', error);
    return NextResponse.redirect(errorRedirect);
  }
}

export async function handleGoogleDisconnect(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDatabase();
  await db
    .delete(integrations)
    .where(
      and(
        eq(integrations.userId, session.user.id),
        eq(integrations.provider, 'google'),
      ),
    );

  return NextResponse.json({ ok: true });
}
