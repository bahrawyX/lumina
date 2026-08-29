import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { goals } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { awardCoins } from '@/lib/coins/awardCoins';
import { goalCompleteAwards } from '@/lib/coins/earnRules';
import { scopeAwards, utcDateKey } from '@/lib/coins/dedupeKeys';
import { apiError, logger } from '@/lib/logger';
import { checkFieldLengths, FIELD_LIMITS } from '@/lib/fieldLimits';
import { invalidIdResponse, parseRouteId } from '@/lib/routeParams';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** PATCH /api/goals/[id] — update a goal */
export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id: rawId } = await context.params;
  // P2-1: every PK is a uuid and this went straight into `eq(table.id, id)`,
  // so Postgres raised 22P02 and the client got a generic 500.
  const id = parseRouteId(rawId);
  if (!id) return invalidIdResponse();
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
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    const tooLong = checkFieldLengths({
      title: { value: body.title, max: FIELD_LIMITS.shortTitle },
      description: { value: body.description, max: FIELD_LIMITS.description },
    });
    if (tooLong) return tooLong;

    if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim();
    if (typeof body.description === 'string') patch.description = body.description || null;
    if (typeof body.emoji === 'string') patch.emoji = body.emoji || null;
    const validColors = ['blue', 'green', 'purple', 'orange', 'red'];
    if (typeof body.color === 'string' && validColors.includes(body.color)) patch.color = body.color;
    const validStatuses = ['active', 'completed', 'archived'];
    if (typeof body.status === 'string' && validStatuses.includes(body.status)) patch.status = body.status;
    const validTimeframes = ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'];
    if (typeof body.timeframe === 'string' && validTimeframes.includes(body.timeframe)) patch.timeframe = body.timeframe;
    if (typeof body.startDate === 'string') {
      const d = new Date(body.startDate);
      if (!isNaN(d.getTime())) patch.startDate = d;
    }
    if (typeof body.endDate === 'string') {
      const d = new Date(body.endDate);
      if (!isNaN(d.getTime())) patch.endDate = d;
    }

    // Get pre-update status for comparison
    const [prev] = await db
      .select({
        status: goals.status,
        timeframe: goals.timeframe,
        startDate: goals.startDate,
        endDate: goals.endDate,
      })
      .from(goals)
      .where(and(eq(goals.id, id), eq(goals.userId, userId)));

    /**
     * The date range has to stay ordered.
     *
     * `POST /api/goals` rejects `end <= start`; this handler only checked that
     * each date PARSED. So a goal could be edited into "Aug 24 - Aug 10", which
     * the UI then renders as permanently Overdue with a negative span — and
     * `differenceInCalendarDays(endDate, startDate)` in `GoalDetailSheet` goes
     * negative, so every progress figure derived from it is meaningless.
     *
     * Validated against the RESULTING range, not just the submitted fields: a
     * PATCH that moves only `endDate` has to be checked against the stored
     * `startDate`, or half an edit slips through.
     */
    if (prev) {
      const nextStart = (patch.startDate as Date | undefined) ?? prev.startDate;
      const nextEnd = (patch.endDate as Date | undefined) ?? prev.endDate;
      if (nextStart && nextEnd && nextEnd <= nextStart) {
        return NextResponse.json(
          { error: 'endDate must be after startDate' },
          { status: 400 },
        );
      }
    }

    // P2-2: this was a blind write. `db.update(...)` matching zero rows is not
    // an error in Drizzle, so a PATCH against a goal that does not exist — or
    // that belongs to somebody else — updated nothing and still answered
    // `{ ok: true }`. The client had no way to tell a successful edit from an
    // edit of a deleted goal, and would keep showing the stale row.
    //
    // `.returning()` on the UPDATE rather than a check against `prev` above:
    // the SELECT and the UPDATE are separate statements, so a goal deleted
    // between them would pass a `prev`-based guard and still write nothing.
    const updated = await db
      .update(goals)
      .set(patch)
      .where(and(eq(goals.id, id), eq(goals.userId, userId)))
      .returning({ id: goals.id });

    if (updated.length === 0) {
      // Deliberately the same 404 for "no such goal" and "not yours": the
      // route must not confirm the existence of another user's goal.
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Award coins on goal completion. Awaited (not fire-and-forget) so the
    // returned newBalance is the post-award DB value — otherwise the client
    // would refetch a stale balance and the UI would lag the toast.
    let newBalance: number | undefined;
    let coinsEarned: number | undefined;
    if (patch.status === 'completed' && prev?.status !== 'completed') {
      // H1: awards keyed by goalId, so completed→active→completed cannot re-award —
      // the app-level status guard plus the ledger dedupe key are belt-and-braces.
      const entries = scopeAwards(goalCompleteAwards(prev?.timeframe ?? 'custom'), {
        entityId: id,
        sourceType: 'goal',
        utcDate: utcDateKey(new Date()),
      });
      try {
        const res = await awardCoins(userId, entries);
        newBalance = res.newBalance;
        coinsEarned = res.applied;
      } catch (e) {
        logger.error('unhandled', { route: 'goal complete coin award' }, e);
      }
    }

    return NextResponse.json({ ok: true, newBalance, coinsEarned });
  } catch (err) {
    return apiError('PATCH /api/goals/[id]', err);
  }
}

/** DELETE /api/goals/[id] — soft archive (default) or hard delete (?hard=true) */
export async function DELETE(req: NextRequest, context: RouteContext) {
  const { id: rawId } = await context.params;
  // P2-1: every PK is a uuid and this went straight into `eq(table.id, id)`,
  // so Postgres raised 22P02 and the client got a generic 500.
  const id = parseRouteId(rawId);
  if (!id) return invalidIdResponse();
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const hard = req.nextUrl.searchParams.get('hard') === 'true';

  try {
    const db = getDatabase();
    const affected = hard
      ? await db
          .delete(goals)
          .where(and(eq(goals.id, id), eq(goals.userId, userId)))
          .returning({ id: goals.id })
      : await db
          .update(goals)
          .set({ status: 'archived', updatedAt: new Date() })
          .where(and(eq(goals.id, id), eq(goals.userId, userId)))
          .returning({ id: goals.id });

    // P2-2: the write was issued and success returned unconditionally, so a
    // request for a nonexistent (or another user's) id answered 200 {ok:true}.
    // Ownership is enforced by the WHERE, so this was never a security hole —
    // but the client could not distinguish a lost write from a real one.
    if (affected.length === 0) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError('DELETE /api/goals/[id]', err);
  }
}
