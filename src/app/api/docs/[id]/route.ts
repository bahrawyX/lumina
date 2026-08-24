import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { docs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { awardCoins } from '@/lib/coins/awardCoins';
import { scopeAward, utcDateKey } from '@/lib/coins/dedupeKeys';
import { computeWordCount } from '@/lib/docs/wordCount';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** GET /api/docs/[id] — return full doc including content JSONB. */
export async function GET(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
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
  const { id } = await context.params;
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

    // Stale-write check: if client sends updatedAt AND content changed,
    // compare to DB updatedAt — return 409 if stale.
    if (typeof body.updatedAt === 'string' && body.content !== undefined) {
      const [current] = await db
        .select({ updatedAt: docs.updatedAt, content: docs.content })
        .from(docs)
        .where(and(eq(docs.id, id), eq(docs.userId, userId)));

      if (current) {
        const clientUpdatedAt = new Date(body.updatedAt as string).getTime();
        const serverUpdatedAt = current.updatedAt.getTime();
        if (clientUpdatedAt < serverUpdatedAt) {
          return NextResponse.json(
            { error: 'conflict', serverContent: current.content },
            { status: 409 }
          );
        }
      }
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };

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

    if (body.parentId === null) patch.parentId = null;
    else if (typeof body.parentId === 'string' && body.parentId.trim()) {
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
      .where(and(eq(docs.id, id), eq(docs.userId, userId)))
      .returning({ updatedAt: docs.updatedAt });

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
  const { id } = await context.params;
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const url = new URL(req.url);
  const hard = url.searchParams.get('hard') === 'true';

  try {
    const db = getDatabase();

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

      await db
        .delete(docs)
        .where(and(eq(docs.id, id), eq(docs.userId, userId)));
    } else {
      // Soft delete: archive this doc and all descendants
      await db
        .update(docs)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(and(eq(docs.id, id), eq(docs.userId, userId)));

      // Also archive direct children (recursive would need CTE, but immediate children is sufficient for MVP)
      await db
        .update(docs)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(and(eq(docs.parentId, id), eq(docs.userId, userId)));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('unhandled', { route: 'DELETE /api/docs/[id]' }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
