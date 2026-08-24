import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { docs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { awardCoins } from '@/lib/coins/awardCoins';
import { scopeAward, utcDateKey } from '@/lib/coins/dedupeKeys';
import { computeWordCount } from '@/lib/docs/wordCount';
import { logger } from '@/lib/logger';
import { checkLinkedOwnership, wouldCreateDocCycle } from '@/lib/ownership';
import { docStaleGuard, nextDocUpdatedAt } from '@/lib/docs/staleWrite';
import { invalidIdResponse, parseRouteId } from '@/lib/routeParams';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** GET /api/docs/[id] — return full doc including content JSONB. */
export async function GET(req: NextRequest, context: RouteContext) {
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
  void req;

  try {
    const db = getDatabase();
    const [row] = await db
      .select()
      .from(docs)
      .where(and(eq(docs.id, id), eq(docs.userId, userId)));

    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: row.id,
      parentId: row.parentId ?? null,
      title: row.title,
      icon: row.icon ?? null,
      isPinned: row.isPinned,
      isArchived: row.isArchived,
      position: row.position,
      linkedTaskId: row.linkedTaskId ?? null,
      linkedEventId: row.linkedEventId ?? null,
      wordCount: row.wordCount,
      content: row.content,
      contentText: row.contentText ?? '',
      coverImage: row.coverImage ?? null,
      coverGradient: row.coverGradient ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (err) {
    logger.error('unhandled', { route: 'GET /api/docs/[id]' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/docs/[id] — update a doc with stale-write protection. */
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

    // P2-6: the stale-write check used to be a SELECT here followed by a blind
    // UPDATE below. Two concurrent saves both read the same `updated_at`, both
    // passed, and the second silently overwrote the first — so the 409 fired
    // only for a client that was already visibly behind, and never under the
    // real concurrency it exists to catch.
    //
    // The check is folded into the write's WHERE instead (`updated_at <=` the
    // client's copy), which Postgres evaluates against the row it is about to
    // lock. Whoever commits second matches zero rows and gets the 409.
    const clientUpdatedAt =
      typeof body.updatedAt === 'string' && body.content !== undefined
        ? new Date(body.updatedAt)
        : null;
    const staleGuard = docStaleGuard(clientUpdatedAt);

    // The new `updated_at` comes from the DATABASE clock, not this instance's.
    // See `nextDocUpdatedAt` for why an app-server timestamp made the guard
    // depend on clock skew between serverless instances.
    const patch: Record<string, unknown> = { updatedAt: nextDocUpdatedAt() };

    if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim();
    if (body.content !== undefined) patch.content = body.content;
    // H3: word count is recomputed server-side from contentText — never trust the
    // client value (a `{wordCount:500}` PATCH on an empty doc must not earn coins).
    let computedWordCount: number | undefined;
    if (typeof body.contentText === 'string') {
      patch.contentText = body.contentText;
      computedWordCount = computeWordCount(body.contentText);
      patch.wordCount = computedWordCount;
    }
    if (typeof body.icon === 'string' || body.icon === null) patch.icon = body.icon;
    if (typeof body.coverImage === 'string' || body.coverImage === null) patch.coverImage = body.coverImage;
    if (typeof body.coverGradient === 'number' || body.coverGradient === null) patch.coverGradient = body.coverGradient;
    if (typeof body.isArchived === 'boolean') patch.isArchived = body.isArchived;
    if (typeof body.isPinned === 'boolean') patch.isPinned = body.isPinned;
    if (typeof body.position === 'number') patch.position = body.position;

    // P1-4: none of these three were ownership-checked on PATCH.
    const ownershipFailure = await checkLinkedOwnership(db, userId, {
      parentId: { value: body.parentId, table: 'docs' },
      linkedTaskId: { value: body.linkedTaskId, table: 'tasks' },
      linkedEventId: { value: body.linkedEventId, table: 'events' },
    });
    if (ownershipFailure) {
      return NextResponse.json(
        { error: `${ownershipFailure.field} not found` },
        { status: 404 },
      );
    }

    if (body.parentId === null) patch.parentId = null;
    else if (typeof body.parentId === 'string' && body.parentId.trim()) {
      // `docs.parentId` could additionally be set to the doc itself or one of
      // its own descendants, producing a CYCLE — after which any recursive walk
      // of the docs tree loops forever.
      if (await wouldCreateDocCycle(db, userId, id, body.parentId.trim())) {
        return NextResponse.json(
          { error: 'parentId would create a cycle' },
          { status: 400 },
        );
      }
      patch.parentId = body.parentId;
    }

    if (body.linkedTaskId === null) patch.linkedTaskId = null;
    else if (typeof body.linkedTaskId === 'string' && body.linkedTaskId.trim()) {
      patch.linkedTaskId = body.linkedTaskId;
    }

    if (body.linkedEventId === null) patch.linkedEventId = null;
    else if (typeof body.linkedEventId === 'string' && body.linkedEventId.trim()) {
      patch.linkedEventId = body.linkedEventId;
    }

    const [updated] = await db
      .update(docs)
      .set(patch)
      .where(and(eq(docs.id, id), eq(docs.userId, userId), staleGuard))
      .returning({ updatedAt: docs.updatedAt });

    if (!updated) {
      // Zero rows means one of two things. One read tells them apart, and it
      // only runs on the failure path.
      const [current] = await db
        .select({ content: docs.content })
        .from(docs)
        .where(and(eq(docs.id, id), eq(docs.userId, userId)));

      // P2-2: PATCH on a nonexistent doc used to answer 200 {"ok":true}.
      if (!current) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }
      return NextResponse.json(
        { error: 'conflict', serverContent: current.content },
        { status: 409 },
      );
    }

    // Award coins for 500+ word doc, dedup by docId. Awaited so the
    // response carries the post-award balance.
    let newBalance: number | undefined;
    if (computedWordCount !== undefined && computedWordCount >= 500) {
      try {
        // Gated on the server-computed count; idempotent per doc via the ledger
        // key `doc_500_words:<docId>` — re-sending the PATCH cannot re-award.
        const entry = scopeAward(
          { amount: 10, reason: 'doc_500_words', label: 'Wrote a 500+ word doc' },
          { entityId: id, sourceType: 'doc', utcDate: utcDateKey(new Date()) },
        );
        const res = await awardCoins(userId, [entry]);
        newBalance = res.newBalance;
      } catch (e) { logger.error('unhandled', { route: 'doc 500-word award' }, e); }
    }

    return NextResponse.json({
      ok: true,
      updatedAt: updated?.updatedAt?.toISOString() ?? new Date().toISOString(),
      newBalance,
    });
  } catch (err) {
    logger.error('unhandled', { route: 'PATCH /api/docs/[id]' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/docs/[id] — soft delete (archive) or hard delete with confirmation. */
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

  const url = new URL(req.url);
  const hard = url.searchParams.get('hard') === 'true';

  try {
    const db = getDatabase();
    let affected: Array<{ id: string }> = [];

    if (hard) {
      // Hard delete requires confirmation body
      let body: Record<string, unknown> = {};
      try {
        body = await req.json();
      } catch {
        /* no body is fine for soft delete */
      }
      if (body.confirm !== true) {
        return NextResponse.json(
          { error: 'Hard delete requires { confirm: true } in body' },
          { status: 400 }
        );
      }

      // Promote children to root before hard-deleting
      await db
        .update(docs)
        .set({ parentId: null })
        .where(and(eq(docs.parentId, id), eq(docs.userId, userId)));

      affected = await db
        .delete(docs)
        .where(and(eq(docs.id, id), eq(docs.userId, userId)))
        .returning({ id: docs.id });
    } else {
      // Soft delete: archive this doc and all descendants
      affected = await db
        .update(docs)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(and(eq(docs.id, id), eq(docs.userId, userId)))
        .returning({ id: docs.id });

      // Also archive direct children (recursive would need CTE, but immediate children is sufficient for MVP)
      await db
        .update(docs)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(and(eq(docs.parentId, id), eq(docs.userId, userId)));
    }

    // P2-2: the write was issued and success returned unconditionally, so a
    // request for a nonexistent (or another user's) id answered 200 {ok:true}.
    // Ownership is enforced by the WHERE, so this was never a security hole —
    // but the client could not distinguish a lost write from a real one.
    if (affected.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('unhandled', { route: 'DELETE /api/docs/[id]' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
