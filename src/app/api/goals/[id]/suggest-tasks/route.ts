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

const apiKey = process.env.GEMINI_API_KEY ?? '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

interface RouteContext {
  params: Promise<{ id: string }>;
}

const DAILY_LIMIT = 5;
type RateBucket = { day: string; count: number };
const rateMap = new Map<string, RateBucket>();
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
function checkAndIncrement(userId: string): boolean {
  const today = todayUtc();
  const cur = rateMap.get(userId);
  if (!cur || cur.day !== today) {
    rateMap.set(userId, { day: today, count: 1 });
    return true;
  }
  if (cur.count >= DAILY_LIMIT) return false;
  cur.count += 1;
  return true;
}

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

    // User-curated insert path — short-circuit Gemini + the rate limiter.
    if (clientTitles && clientTitles.length > 0) {
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
    if (!checkAndIncrement(userId)) {
      return NextResponse.json(
        { error: 'rate_limit', message: "You've used your AI task suggestions for today. Try again tomorrow." },
        { status: 429 },
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
    console.error('[POST /api/goals/[id]/suggest-tasks]', {
      message: e.message, code: e.code, detail: e.detail,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
