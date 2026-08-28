import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { tasks } from '@/db/schema';
import { apiError } from '@/lib/logger';

/**
 * PATCH /api/tasks/reorder — apply a new order to several tasks atomically.
 *
 * P1-17: a drag-reorder fired
 *
 *     updated.forEach(t => tasksPersistence.updateOne(t.id, { order: t.order }));
 *
 * an N-request fan-out where any subset can fail, leaving the board's order
 * permanently divergent from the database **with no signal at all**. For a
 * 40-task column that is 40 requests, each independently able to 500.
 *
 * One request, one transaction: the whole reorder applies or none of it does.
 */
const bodySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        order: z.number().int().min(0).max(100_000),
      }),
    )
    .min(1)
    // A column that large is not a real board, and the statement below is
    // linear in this count.
    .max(500),
});

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid body' },
      { status: 400 },
    );
  }
  const { items } = parsed.data;

  try {
    const db = getDatabase();
    const ids = items.map((i) => i.id);

    // One UPDATE with a CASE expression rather than N statements. The
    // `userId` predicate is what keeps this from touching another account's
    // rows even if a foreign id is supplied — the rows simply don't match.
    const caseArms = sql.join(
      items.map((i) => sql`when ${tasks.id} = ${i.id}::uuid then ${i.order}`),
      sql` `,
    );

    const updated = await db
      .update(tasks)
      .set({
        position: sql`case ${caseArms} else ${tasks.position} end`,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.userId, userId), inArray(tasks.id, ids)))
      .returning({ id: tasks.id });

    // Report how many actually moved. A short count means some ids were not
    // the caller's (or no longer exist), which the client should reconcile
    // rather than silently diverge from.
    return NextResponse.json({ ok: true, updated: updated.length, requested: items.length });
  } catch (err) {
    return apiError('PATCH /api/tasks/reorder', err, { userId });
  }
}
