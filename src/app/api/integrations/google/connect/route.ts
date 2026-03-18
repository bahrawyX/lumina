import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { cookies } from 'next/headers';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const STATE_COOKIE = 'lumina_google_connect_state';

/**
 * GET /api/integrations/google/connect
 *
 * Initiates the Google Calendar integration OAuth flow.
 * Only requests calendar.readonly scope — completely separate from login.
 *
 * Called by the frontend popup. Redirects to Google's consent screen.
 * Session must exist (user must be logged in).
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  const baseURL = process.env.BETTER_AUTH_URL ?? new URL(req.url).origin;

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'Google integration is not configured on this server.' },
      { status: 503 },
    );
  }

  // Cryptographically random state nonce — verified in the callback
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseURL}/api/integrations/google/callback`,
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    // offline access ensures a refresh token is returned for this integration
    access_type: 'offline',
    // consent forces Google to issue a fresh refresh token every time
    prompt: 'consent',
    state,
  });

  const response = NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params}`);

  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60, // 10-minute window for the OAuth flow
    path: '/',
  });

  return response;
}
