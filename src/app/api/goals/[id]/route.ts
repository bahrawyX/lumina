import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { goals } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { awardCoins } from '@/lib/coins/awardCoins';
import { goalCompleteAwards } from '@/lib/coins/earnRules';
import { scopeAwards, utcDateKey } from '@/lib/coins/dedupeKeys';
import { apiError, logger } from '@/lib/logger';
import { parseBody } from '@/lib/api/parseBody';
import { updateGoalSchema } from '@/lib/api/schemas';
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

  const parsed = await parseBody(req, updateGoalSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  try {
    const db = getDatabase();
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    // Still built field by field, because "absent" and "null" mean different
    // things here and only the handler knows which: an absent key leaves the
    // column alone, an empty string clears it. The schema's job was to
    // guarantee that whatever IS present has a usable value — so there is no
    // longer a branch that quietly drops a bad one.
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description || null;
    if (body.emoji !== undefined) patch.emoji = body.emoji || null;
    if (body.color !== undefined) patch.color = body.color;
    if (body.status !== undefined) patch.status = body.status;
    if (body.timeframe !== undefined) patch.timeframe = body.timeframe;
    if (body.startDate !== undefined) patch.startDate = new Date(body.startDate);
    if (body.endDate !== undefined) patch.endDate = new Date(body.endDate);

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
     * `updateGoalSchema` already rejects a request that carries an inverted
     * range on its own. This is the half a schema cannot do: a PATCH that
     * moves only `endDate` has to be compared against the STORED `startDate`,
     * and the schema has never seen the row.
     *
     * Without it a goal could be edited into "Aug 24 - Aug 10", which the UI
     * renders as permanently Overdue with a negative span — and
     * `differenceInCalendarDays(endDate, startDate)` in `GoalDetailSheet` goes
     * negative, so every progress figure derived from it is meaningless.
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
