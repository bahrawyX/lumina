import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { docs } from '@/db/schema';
import { sql, eq, and } from 'drizzle-orm';

/** GET /api/docs/search?q=... — PostgreSQL full-text search across docs. */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const db = getDatabase();

    const tsvector = sql`to_tsvector('english', coalesce(${docs.title}, '') || ' ' || coalesce(${docs.contentText}, ''))`;
    const tsquery = sql`plainto_tsquery('english', ${q})`;

    const results = await db
      .select({
        id: docs.id,
        title: docs.title,
        icon: docs.icon,
        parentId: docs.parentId,
        updatedAt: docs.updatedAt,
        excerpt: sql<string>`ts_headline(
          'english',
          coalesce(${docs.title}, '') || ' ' || coalesce(${docs.contentText}, ''),
          ${tsquery},
          'MaxWords=20, MinWords=10, StartSel=<mark>, StopSel=</mark>'
        )`,
      })
      .from(docs)
      .where(
        and(
          eq(docs.userId, userId),
          eq(docs.isArchived, false),
          sql`${tsvector} @@ ${tsquery}`
        )
      )
      .orderBy(sql`ts_rank(${tsvector}, ${tsquery}) DESC`)
      .limit(20);

    const mapped = results.map((row) => ({
      id: row.id,
      title: row.title,
      icon: row.icon ?? null,
      parentId: row.parentId ?? null,
      updatedAt: row.updatedAt.toISOString(),
      excerpt: row.excerpt,
    }));

    return NextResponse.json(mapped);
  } catch (err) {
    console.error('[GET /api/docs/search]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
