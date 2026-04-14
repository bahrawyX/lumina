import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

/** POST /api/shop/activate-cosmetic — activate a cosmetic override */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const db = getDatabase();

    const [user] = await db
      .select({ ownedItems: users.ownedItems, activeCosmetics: users.activeCosmetics })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const owned = (user.ownedItems as string[]) ?? [];
    const current = (user.activeCosmetics as Record<string, unknown>) ?? {};
    const patch: Record<string, unknown> = { ...current };

    // Accent color
    if (body.accentColor !== undefined) {
      if (body.accentColor === null) {
        delete patch.accentColor; // Reset to default
      } else {
        const colorItemId = `accent_${body.accentColor}`;
        if (!owned.includes(colorItemId)) {
          return NextResponse.json({ error: 'Item not owned' }, { status: 403 });
        }
        patch.accentColor = body.accentColor;
      }
    }

    // Confetti
    if (body.confetti !== undefined) {
      if (body.confetti && !owned.includes('confetti_unlock')) {
        return NextResponse.json({ error: 'Confetti not unlocked' }, { status: 403 });
      }
      patch.confetti = Boolean(body.confetti);
    }

    await db
      .update(users)
      .set({ activeCosmetics: patch })
      .where(eq(users.id, userId));

    return NextResponse.json({ ok: true, activeCosmetics: patch });
  } catch (err) {
    console.error('[POST /api/shop/activate-cosmetic]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
