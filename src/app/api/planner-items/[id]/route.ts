import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { plannerItems } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

// ── Validation ───────────────────────────────────────────────────────────────

const patchSchema = z.object({
  startTime: z.string().datetime({ message: 'startTime must be ISO 8601' }).optional(),
  endTime: z.string().datetime({ message: 'endTime must be ISO 8601' }).optional(),
  isAutoScheduled: z.boolean().optional(),
}).refine(
  (d) => {
    // If both provided, end must be after start
    if (d.startTime && d.endTime) {
      return new Date(d.endTime) > new Date(d.startTime);
    }
    return true;
  },
  { message: 'endTime must be after startTime', path: ['endTime'] },
);

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ── PATCH /api/planner-items/[id] ─────────────────────────────────────────────

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const db = getDatabase();
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (parsed.data.startTime) patch.startTime = new Date(parsed.data.startTime);
    if (parsed.data.endTime) patch.endTime = new Date(parsed.data.endTime);
    if (parsed.data.isAutoScheduled !== undefined) patch.isAutoScheduled = parsed.data.isAutoScheduled;

    await db
      .update(plannerItems)
      .set(patch)
      .where(and(eq(plannerItems.id, id), eq(plannerItems.userId, userId)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/planner-items/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── DELETE /api/planner-items/[id] ────────────────────────────────────────────

export async function DELETE(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const db = getDatabase();
    await db
      .delete(plannerItems)
      .where(and(eq(plannerItems.id, id), eq(plannerItems.userId, userId)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/planner-items/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
