import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { integrations } from '@/db/schema';
import { runFullGoogleSync } from '@/lib/integrations/google/sync';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

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

  const state = JSON.stringify({ userId: session.user.id });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseURL}/api/integrations/google/callback`,
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params}`);
}

export async function handleGoogleCallback(req: NextRequest) {
  try {
    const baseURL = process.env.BETTER_AUTH_URL ?? new URL(req.url).origin;
    const expectedRedirect = `${baseURL}/api/integrations/google/callback`;

    const { searchParams } = req.nextUrl;
    const code = searchParams.get('code');
    const rawState = searchParams.get('state');
    const errorParam = searchParams.get('error');

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
    if (!userId) {
      return NextResponse.json(
        {
          error: 'GOOGLE_CALLBACK_FAILED',
          detail: 'Missing userId in state',
        },
        { status: 400 },
      );
    }

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

    if (!tokenData.access_token) {
      return NextResponse.json(
        {
          error: 'GOOGLE_CALLBACK_FAILED',
          detail: 'Token response missing access_token.',
        },
        { status: 500 },
      );
    }

    const db = getDatabase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (tokenData.expires_in ?? 3600) * 1000);

    const [existing] = await db
      .select({ refreshToken: integrations.refreshToken })
      .from(integrations)
      .where(and(eq(integrations.userId, userId), eq(integrations.provider, 'google')))
      .limit(1);

    const refreshToken = tokenData.refresh_token ?? existing?.refreshToken;
    if (!refreshToken) {
      return NextResponse.json(
        {
          error: 'GOOGLE_CALLBACK_FAILED',
          detail: 'Missing refresh token and no existing one.',
        },
        { status: 500 },
      );
    }

    await db
      .insert(integrations)
      .values({
        userId,
        provider: 'google',
        accessToken: tokenData.access_token,
        refreshToken: refreshToken ?? existing?.refreshToken,
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
          refreshToken: refreshToken ?? existing?.refreshToken,
          expiresAt,
          scope: tokenData.scope ?? CALENDAR_SCOPE,
          status: 'active',
          updatedAt: now,
        },
      });

    await runFullGoogleSync(userId);

    return NextResponse.redirect(`${baseURL}/auth/popup-complete?provider=google`);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'GOOGLE_CALLBACK_FAILED',
        detail: String(error),
      },
      { status: 500 },
    );
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
