import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { parseBody } from '@/lib/api/parseBody';
import { createDocSchema } from '@/lib/api/schemas';
import { docs, tasks, events } from '@/db/schema';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { awardCoins } from '@/lib/coins/awardCoins';
import { scopeAward, utcDateKey } from '@/lib/coins/dedupeKeys';
import { firstDocEverAward } from '@/lib/coins/earnRules';
import { apiError, logger } from '@/lib/logger';

/** GET /api/docs — return flat list of DocTreeNode[] for sidebar (no content field). */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  void req;

  try {
    const db = getDatabase();
    const rows = await db
      .select({
        id: docs.id,
        parentId: docs.parentId,
        title: docs.title,
        icon: docs.icon,
        isPinned: docs.isPinned,
        isArchived: docs.isArchived,
        position: docs.position,
        linkedTaskId: docs.linkedTaskId,
        linkedEventId: docs.linkedEventId,
        wordCount: docs.wordCount,
        createdAt: docs.createdAt,
        updatedAt: docs.updatedAt,
      })
      .from(docs)
      .where(eq(docs.userId, userId))
      .orderBy(desc(docs.isPinned), asc(docs.position), desc(docs.updatedAt));

    const mapped = rows.map((row) => ({
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
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));

    return NextResponse.json(mapped);
  } catch (err) {
    return apiError('GET /api/docs', err);
  }
}

/** POST /api/docs — create a new doc. */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  // `parentId` in particular: the ancestor walk below does
  // `eq(docs.id, currentParent)` with this value, so a non-uuid string raised
  // Postgres 22P02 and surfaced as a 500 — the P2-1 defect, fixed for route
  // params and missed for this body field. `title` (varchar 512) and `icon`
  // (varchar 64) were unbounded for the same reason.
  const parsed = await parseBody(req, createDocSchema);
  if (!parsed.ok) return parsed.response;
  const {
    title,
    parentId,
    icon,
    content,
    contentText,
    linkedTaskId,
    linkedEventId,
  } = parsed.data;

  try {
    const db = getDatabase();

    // Validate nesting depth (max 5) if parentId provided
    if (parentId) {
      let depth = 1;
      let currentParent: string | null = parentId;
      while (currentParent && depth <= 5) {
        const [parent] = await db
          .select({ parentId: docs.parentId })
          .from(docs)
          .where(and(eq(docs.id, currentParent), eq(docs.userId, userId)));
        if (!parent) {
          return NextResponse.json({ error: 'Parent doc not found' }, { status: 404 });
        }
        currentParent = parent.parentId;
        depth++;
      }
      if (depth > 5) {
        return NextResponse.json({ error: 'Max nesting depth (5) exceeded' }, { status: 400 });
      }
    }

    // Batch 5 (FK ownership on create): linked FKs must belong to the caller.
    if (typeof linkedTaskId === 'string' && linkedTaskId.trim()) {
      const [t] = await db.select({ id: tasks.id }).from(tasks)
        .where(and(eq(tasks.id, linkedTaskId), eq(tasks.userId, userId))).limit(1);
      if (!t) return NextResponse.json({ error: 'linkedTaskId not found' }, { status: 404 });
    }
    if (typeof linkedEventId === 'string' && linkedEventId.trim()) {
      const [e] = await db.select({ id: events.id }).from(events)
        .where(and(eq(events.id, linkedEventId), eq(events.userId, userId))).limit(1);
      if (!e) return NextResponse.json({ error: 'linkedEventId not found' }, { status: 404 });
    }

    // Determine position: max sibling position + 1
    const siblings = await db
      .select({ maxPos: sql<number>`coalesce(max(${docs.position}), -1)` })
      .from(docs)
      .where(
        and(
          eq(docs.userId, userId),
          parentId
            ? eq(docs.parentId, parentId)
            : sql`${docs.parentId} is null`
        )
      );
    const nextPosition = (siblings[0]?.maxPos ?? -1) + 1;

    const wordCount = contentText
      ? contentText.split(/\s+/).filter(Boolean).length
      : 0;

    const [row] = await db
      .insert(docs)
      .values({
        userId,
        parentId: parentId ?? null,
        title: title || 'Untitled',
        icon: icon ?? null,
        content: (content as Record<string, unknown> | undefined) ?? null,
        contentText: contentText ?? '',
        wordCount,
        position: nextPosition,
        linkedTaskId: linkedTaskId ?? null,
        linkedEventId: linkedEventId ?? null,
      })
      .returning();

    // Award coins for first doc ever. Awaited so the response carries
    // the post-award balance.
    let newBalance: number | undefined;
    try {
      const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(docs)
        .where(eq(docs.userId, userId));
      if ((countResult?.count ?? 0) === 1) {
        // Once per user ever — ledger key `first_doc` (idempotent).
        const res = await awardCoins(userId, [scopeAward(firstDocEverAward(), { utcDate: utcDateKey(new Date()) })]);
        newBalance = res.newBalance;
      }
    } catch (e) { logger.error('unhandled', { route: 'docs first-doc award' }, e); }

    return NextResponse.json(
      {
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
        contentText: row.contentText,
        coverImage: row.coverImage ?? null,
        coverGradient: row.coverGradient ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        newBalance,
      },
      { status: 201 }
    );
  } catch (err) {
    return apiError('POST /api/docs', err);
  }
}
