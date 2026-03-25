import { NextRequest, NextResponse } from 'next/server';
import { handleGoogleDisconnect } from '@/lib/integrations/google/oauth';
import { handleMicrosoftDisconnect } from '@/lib/integrations/microsoft/oauth';

interface RouteContext {
  params: Promise<{ provider: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { provider } = await context.params;

  if (provider === 'google') {
    return handleGoogleDisconnect(req);
  }

  if (provider === 'microsoft') {
    return handleMicrosoftDisconnect(req);
  }

  return NextResponse.json({ error: 'Provider not supported' }, { status: 404 });
}
