import { NextRequest, NextResponse } from 'next/server';
import { handleGoogleCallback } from '@/lib/integrations/google/oauth';
import { handleMicrosoftCallback } from '@/lib/integrations/microsoft/oauth';

// TD-5: the Google callback blocks on runFullGoogleSync (90d back / 365d ahead,
// paginated, multi-calendar). Without an explicit ceiling this inherits the
// platform default and can time out the connect on large accounts. Set to the
// Vercel Hobby maximum; #7 bounds the per-calendar fan-out to keep it well under.
export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ provider: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { provider } = await context.params;

  if (provider === 'google') {
    return handleGoogleCallback(req);
  }

  if (provider === 'microsoft') {
    return handleMicrosoftCallback(req);
  }

  return NextResponse.json({ error: 'Provider not supported' }, { status: 404 });
}
