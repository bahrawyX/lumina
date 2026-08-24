/**
 * POST /api/goals/[id]/suggest-tasks
 *
 * Asks Gemini for 3–5 actionable task titles given a goal, then either
 * returns them as suggestions OR (when `create: true`) inserts them into
 * the tasks table linked to the goal.
 *
 * Rate-limited to 5 suggestion requests per user per UTC day. The limit
 * is process-local — good enough to bound Gemini cost on a single Vercel
 * function instance; a small fraction of cold-start re-rolls is acceptable
 * for an AI feature on a Pro tier.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { goals, tasks } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { GoogleGenAI, Type } from '@google/genai';
import { createRateLimiter, rateLimitedResponse } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const apiKey = process.env.GEMINI_API_KEY ?? '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

interface RouteContext {
  params: Promise<{ id: string }>;
}

const DAILY_LIMIT = 5;

/** Durable, so the daily cap is actually daily rather than daily-per-lambda. */
const suggestLimiter = createRateLimiter('goalSuggestTasks', {
  windowMs: 24 * 60 * 60 * 1000,
  max: DAILY_LIMIT,
});

/**
 * The bulk-insert path writes up to 10 task rows and used to run BEFORE any
 * limiter (it returned early, above the check), so it had no limit at all.
 */
const bulkInsertLimiter = createRateLimiter('goalBulkTaskInsert', {
  windowMs: 60 * 60 * 1000,
  max: 30,
});

export async function POST(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const create = body.create === true;
  // When the client passes its own titles (the user edited / removed some),
  // skip Gemini entirely and just insert what they accepted. This avoids
  // wasting an AI call AND lets the UI control the final list.
  const clientTitles =
    create && Array.isArray(body.titles)
      ? (body.titles as unknown[])
          .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
          .map((t) => t.trim().slice(0, 200))
          .slice(0, 10)
      : null;

  try {
    const db = getDatabase();
    const [goal] = await db
      .select()
      .from(goals)
      .where(and(eq(goals.id, id), eq(goals.userId, userId)));

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    // User-curated insert path — short-circuits Gemini, but NOT the limiter.
    // It previously returned before the check below, so this branch — which
    // bulk-inserts up to 10 task rows — was completely unlimited.
    if (clientTitles && clientTitles.length > 0) {
      const bulk = await bulkInsertLimiter.check(userId);
      if (bulk.limited) {
        return rateLimitedResponse(bulk.retryAfterMs, 'Too many task imports. Try again shortly.');
      }
      const inserted = await db
        .insert(tasks)
        .values(
          clientTitles.map((title) => ({
            userId,
            title,
            status: 'todo' as const,
            priority: 'medium' as const,
            difficulty: 'medium' as const,
            estimatedMinutes: 30,
            goalId: id,
          })),
        )
        .returning({ id: tasks.id, title: tasks.title });
      return NextResponse.json({ tasks: inserted }, { status: 201 });
    }

    if (!ai) {
      return NextResponse.json(
        { error: 'AI suggestions are not configured on this server.' },
        { status: 503 },
      );
    }
    const suggest = await suggestLimiter.check(userId);
    if (suggest.limited) {
      return rateLimitedResponse(
        suggest.retryAfterMs,
        "You've used your AI task suggestions for today. Try again tomorrow.",
      );
    }

    const prompt = `The user's goal is: "${goal.title}"
Timeframe: ${goal.timeframe}
${goal.description ? `Context: ${goal.description}` : ''}

Suggest 3–5 concrete, actionable tasks the user should add to their task board to achieve this goal. Each task should be a short imperative phrase (under 60 characters), specific, and immediately doable. No vague items like "think about X" — only things you can DO.

Return ONLY a JSON object of the form { "tasks": [string, ...] }. Nothing else.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        maxOutputTokens: 400,
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['tasks'],
        },
      },
    });

    const raw = response.text ?? '';
    let parsed: { tasks?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Bad AI response' }, { status: 502 });
    }

    const titles = Array.isArray(parsed.tasks)
      ? (parsed.tasks as unknown[])
          .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
          .map((t) => t.trim().slice(0, 200))
          .slice(0, 5)
      : [];

    if (titles.length === 0) {
      return NextResponse.json({ error: 'No suggestions generated' }, { status: 502 });
    }

    if (!create) {
      // Caller just wants the suggestions to render in a confirmation card.
      return NextResponse.json({ suggestions: titles });
    }

    // Insert all titles linked to this goal.
    const inserted = await db
      .insert(tasks)
      .values(
        titles.map((title) => ({
          userId,
          title,
          status: 'todo' as const,
          priority: 'medium' as const,
          difficulty: 'medium' as const,
          estimatedMinutes: 30,
          goalId: id,
        })),
      )
      .returning({ id: tasks.id, title: tasks.title });

    return NextResponse.json({ tasks: inserted }, { status: 201 });
  } catch (err) {
    const e = err as Error & { code?: string; detail?: string };
    logger.error('unhandled', {
      route: 'POST /api/goals/[id]/suggest-tasks',
      pgCode: e?.code,
      pgDetail: e?.detail,
    }, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
