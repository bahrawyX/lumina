import { NextRequest, NextResponse } from 'next/server';
import { handleGoogleConnect } from '@/lib/integrations/google/oauth';
import { handleMicrosoftConnect } from '@/lib/integrations/microsoft/oauth';

interface RouteContext {
  params: Promise<{ provider: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { provider } = await context.params;

  if (provider === 'google') {
    return handleGoogleConnect(req);
  }

  if (provider === 'microsoft') {
    return handleMicrosoftConnect(req);
  }

  return NextResponse.json({ error: 'Provider not supported' }, { status: 404 });
}
