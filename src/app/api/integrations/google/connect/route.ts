import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

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
  console.log('[GOOGLE CONNECT] START');

  const session = await auth.api.getSession({ headers: req.headers });
  const baseURL = process.env.BETTER_AUTH_URL ?? new URL(req.url).origin;

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID_CALENDAR;
  console.log('[GOOGLE CONNECT] CLIENT ID:', process.env.GOOGLE_CLIENT_ID_CALENDAR);
  console.log('[GOOGLE CONNECT] REDIRECT URI:', `${baseURL}/api/integrations/google/callback`);

  if (!clientId) {
    return NextResponse.json(
      { error: 'Google integration is not configured on this server.' },
      { status: 503 },
    );
  }

  const state = JSON.stringify({
    userId: session.user.id,
  });

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

  console.log('[GOOGLE CONNECT] URL:', `${GOOGLE_AUTH_URL}?${params.toString()}`);

  return NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params}`);
}
