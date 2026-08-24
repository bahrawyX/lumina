import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { GoogleGenAI } from '@google/genai';
import { awardCoins } from '@/lib/coins/awardCoins';
import { scopeAward, utcDateKey } from '@/lib/coins/dedupeKeys';
import { aiInDocsAward } from '@/lib/coins/earnRules';
import { createRateLimiter, rateLimitedResponse } from '@/lib/rateLimit';

// Durable, cross-instance. The previous hand-rolled `Map` was per-lambda
// memory, so the effective ceiling was 10 x (warm instances) rather than 10.
const perMinuteLimiter = createRateLimiter('aiStream', { windowMs: 60_000, max: 10 });

// A hard daily ceiling on top of the per-minute one. Without it, a caller
// staying just under 10/min still costs ~14,400 Gemini generations a day.
const perDayLimiter = createRateLimiter('aiStreamDaily', {
  windowMs: 24 * 60 * 60 * 1000,
  max: 200,
});

/** POST /api/docs/ai-stream — Gemini streaming proxy for doc AI features. */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const perMinute = await perMinuteLimiter.check(userId);
  if (perMinute.limited) {
    return rateLimitedResponse(perMinute.retryAfterMs, 'Max 10 AI requests per minute.');
  }
  const perDay = await perDayLimiter.check(userId);
  if (perDay.limited) {
    return rateLimitedResponse(
      perDay.retryAfterMs,
      "You've used your AI assistance for today. It resets tomorrow.",
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { prompt, context } = body as { prompt?: string; context?: string };

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
    return NextResponse.json({ error: 'prompt is required (min 3 chars)' }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
  }

  // Award coins for using AI in docs — once per UTC day, idempotent via the
  // ledger key `ai_docs:<utc-date>` (M2, no check-then-award race).
  void awardCoins(userId, [scopeAward(aiInDocsAward(), { utcDate: utcDateKey(new Date()) })])
    .catch((e) => console.error('[ai-docs coin award]', e));

  try {
    const ai = new GoogleGenAI({ apiKey });

    const fullPrompt = context
      ? `Context:\n${context}\n\nUser request:\n${prompt.trim()}`
      : prompt.trim();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await ai.models.generateContentStream({
            model: 'gemini-2.0-flash',
            contents: fullPrompt,
          });

          for await (const chunk of response) {
            const text = chunk.text;
            if (text) {
              controller.enqueue(new TextEncoder().encode(text));
            }
          }
          controller.close();
        } catch (err) {
          console.error('[AI stream error]', err);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('[POST /api/docs/ai-stream]', err);
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
  }
}
