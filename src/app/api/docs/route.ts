import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { docs } from '@/db/schema';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { awardCoins } from '@/lib/coins/awardCoins';

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
    console.error('[GET /api/docs]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/docs — create a new doc. */
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

  const {
    title,
    parentId,
    icon,
    content,
    contentText,
    linkedTaskId,
    linkedEventId,
  } = body as {
    title?: string;
    parentId?: string | null;
    icon?: string;
    content?: Record<string, unknown>[];
    contentText?: string;
    linkedTaskId?: string | null;
    linkedEventId?: string | null;
  };

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
        title: typeof title === 'string' && title.trim() ? title.trim() : 'Untitled',
        icon: typeof icon === 'string' ? icon : null,
        content: content ?? null,
        contentText: contentText ?? '',
        wordCount,
        position: nextPosition,
        linkedTaskId: typeof linkedTaskId === 'string' && linkedTaskId.trim() ? linkedTaskId : null,
        linkedEventId: typeof linkedEventId === 'string' && linkedEventId.trim() ? linkedEventId : null,
      })
      .returning();

    // Award coins for first doc ever. Awaited so the response carries
    // the post-award balance.
    let newBalance: number | undefined;
    try {
      const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(docs)
        .where(eq(docs.userId, userId));
      if ((countResult?.count ?? 0) === 1) {
        newBalance = await awardCoins(userId, 15, 'first_doc', 'Created your first doc');
      }
    } catch (e) { console.error('[docs first-doc award]', e); }

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
    console.error('[POST /api/docs]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
