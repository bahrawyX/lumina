import { NextRequest, NextResponse } from 'next/server';
import { and, eq, or } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { integrations } from '@/db/schema';

const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const CALENDAR_SCOPE = 'openid offline_access https://graph.microsoft.com/Calendars.Read';
const STATE_COOKIE = 'lumina_microsoft_connect_state';

export async function handleMicrosoftConnect(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  const baseURL = process.env.BETTER_AUTH_URL ?? new URL(req.url).origin;

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'Microsoft integration is not configured on this server.' },
      { status: 503 },
    );
  }

  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseURL}/api/integrations/microsoft/callback`,
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    prompt: 'select_account',
    state,
  });

  const response = NextResponse.redirect(`${MS_AUTH_URL}?${params}`);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60,
    path: '/',
  });

  return response;
}

export async function handleMicrosoftCallback(req: NextRequest) {
  const cookieStore = await cookies();
  const sessionHeaders = new Headers(req.headers);
  const cookieHeader = cookieStore.toString();
  if (cookieHeader) {
    sessionHeaders.set('cookie', cookieHeader);
  }

  const session = await auth.api.getSession({ headers: sessionHeaders });
  const baseURL = process.env.BETTER_AUTH_URL ?? new URL(req.url).origin;
  const errorRedirect = `${baseURL}/auth/popup-complete?provider=microsoft&error=true`;

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Unauthorized: no active session in Microsoft callback.' },
      { status: 401 },
    );
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

    const response = NextResponse.redirect(`${baseURL}/auth/popup-complete?provider=microsoft`);
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch {
    return NextResponse.redirect(errorRedirect);
  }
}

export async function handleMicrosoftDisconnect(req: NextRequest) {
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
        or(
          eq(integrations.provider, 'microsoft'),
          eq(integrations.provider, 'outlook'),
        ),
      ),
    );

  return NextResponse.json({ ok: true });
}
