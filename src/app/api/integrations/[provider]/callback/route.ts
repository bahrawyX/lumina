import { NextRequest, NextResponse } from 'next/server';
import { handleGoogleCallback } from '@/lib/integrations/google/oauth';
import { handleMicrosoftCallback } from '@/lib/integrations/microsoft/oauth';

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
