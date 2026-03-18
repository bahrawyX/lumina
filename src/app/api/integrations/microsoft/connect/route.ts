import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

const MS_AUTH_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';

// offline_access is required to receive a refresh token from Microsoft
const CALENDAR_SCOPE =
  'openid offline_access https://graph.microsoft.com/Calendars.Read';

const STATE_COOKIE = 'lumina_microsoft_connect_state';

/**
 * GET /api/integrations/microsoft/connect
 *
 * Initiates the Microsoft Outlook Calendar integration OAuth flow.
 * Only requests Calendars.Read scope — completely separate from login.
 *
 * prompt=select_account forces Microsoft to show the account picker every
 * time so the user's own account is chosen, not a cached developer session.
 */
export async function GET(req: NextRequest) {
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
    // Forces interactive login — prevents silent reuse of cached developer account
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
