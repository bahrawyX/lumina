import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { achievements } from '@/db/schema';
import { getDatabase } from '@/lib/db';
import { apiError } from '@/lib/logger';
import { z } from 'zod';

/** A UI "mark these as seen" batch — bounded, and every entry a real uuid. */
const markSeenSchema = z
  .array(z.string().uuid('ids must be UUIDs'))
  .min(1, 'ids must be a non-empty array')
  .max(200, 'ids may contain at most 200 entries');

/** GET /api/achievements — all achievements for the authenticated user */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDatabase();
    const rows = await db
      .select({
        id: achievements.id,
        type: achievements.type,
        unlockedAt: achievements.unlockedAt,
        seen: achievements.seen,
      })
      .from(achievements)
      .where(eq(achievements.userId, session.user.id))
      .orderBy(desc(achievements.unlockedAt));

    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        type: r.type,
        unlockedAt: r.unlockedAt.toISOString(),
        seen: r.seen,
      }))
    );
  } catch (err) {
    return apiError('GET /api/achievements', err);
  }
}

/** PATCH /api/achievements — mark achievements as seen */
export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // P3-5: `ids` was checked only for `Array.isArray` and non-empty, then passed
  // straight to `inArray`. A non-UUID entry raised Postgres 22P02 → 500, and a
  // 100k-element array became a 100k-term IN clause. `userId` scoping was
  // already correct, so this was availability, not access.
  const idsResult = markSeenSchema.safeParse(body.ids);
  if (!idsResult.success) {
    return NextResponse.json(
      { error: idsResult.error.issues[0]?.message ?? 'ids must be an array of UUIDs' },
      { status: 400 },
    );
  }

  try {
    const db = getDatabase();
    await db
      .update(achievements)
      .set({ seen: true })
      .where(
        and(
          eq(achievements.userId, session.user.id),
          inArray(achievements.id, idsResult.data),
        )
      );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError('PATCH /api/achievements', err);
  }
}
