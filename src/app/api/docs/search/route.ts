import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { docs } from '@/db/schema';
import { sql, eq, and } from 'drizzle-orm';
import { apiError } from '@/lib/logger';
import { buildDocsPrefixQuery } from '@/lib/docs/searchQuery';

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

  // P2-11: `to_tsquery` parses its ARGUMENT as query syntax, so any `!`, `&`,
  // `|`, `(`, `)` or `:` in what the user typed raised `syntax error in
  // tsquery` and surfaced as a 500 — mid-word, in a box that searches as you
  // type. See `buildDocsPrefixQuery` for why this is not `websearch_to_tsquery`.
  const queryArg = buildDocsPrefixQuery(q);
  if (!queryArg) {
    return NextResponse.json([]);
  }

  try {
    const db = getDatabase();

    // Must match `docs_content_fts_idx` EXACTLY (same expression, same
    // config) or the GIN index is skipped and this recomputes `to_tsvector`
    // over every doc on every keystroke.
    const tsvector = sql`to_tsvector('english', coalesce(${docs.title}, '') || ' ' || coalesce(${docs.contentText}, ''))`;
    // Prefix search: "quar" → "quar:*", "quarterly review" → "quarterly:* & review:*"
    const tsquery = sql`to_tsquery('english', ${queryArg})`;

    // We ask Postgres to mark matches with placeholder tokens (not <mark>),
    // then HTML-escape the entire excerpt client-side, then replace the
    // placeholders with <mark>. This way user-provided characters like
    // <script> or <img onerror=...> that end up in contentText are rendered
    // as text, not HTML, even though the consumer uses dangerouslySetInnerHTML.
    const MARK_START = '\u0001LUMI_MARK_START\u0001';
    const MARK_END = '\u0001LUMI_MARK_END\u0001';

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
          ${'MaxWords=20, MinWords=10, StartSel=' + MARK_START + ', StopSel=' + MARK_END}
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

    const escapeHtml = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const mapped = results.map((row) => ({
      id: row.id,
      title: row.title,
      icon: row.icon ?? null,
      parentId: row.parentId ?? null,
      updatedAt: row.updatedAt.toISOString(),
      excerpt: escapeHtml(row.excerpt)
        .split(MARK_START)
        .join('<mark>')
        .split(MARK_END)
        .join('</mark>'),
    }));

    return NextResponse.json(mapped);
  } catch (err) {
    return apiError('GET /api/docs/search', err);
  }
}
