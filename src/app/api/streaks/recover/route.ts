import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/** POST /api/streaks/recover — placeholder for premium streak recovery */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Placeholder — payment integration required
  return NextResponse.json(
    { ok: false, reason: 'payment_required' },
    { status: 402 },
  );
}
