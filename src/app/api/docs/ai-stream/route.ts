import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { GoogleGenAI } from '@google/genai';
import { awardCoins } from '@/lib/coins/awardCoins';
import { scopeAward, utcDateKey } from '@/lib/coins/dedupeKeys';
import { aiInDocsAward } from '@/lib/coins/earnRules';
import { createRateLimiter, rateLimitedResponse } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

// Durable, cross-instance. The previous hand-rolled `Map` was per-lambda
// memory, so the effective ceiling was 10 x (warm instances) rather than 10.
const perMinuteLimiter = createRateLimiter('aiStream', { windowMs: 60_000, max: 10 });

// A hard daily ceiling on top of the per-minute one. Without it, a caller
// staying just under 10/min still costs ~14,400 Gemini generations a day.
const perDayLimiter = createRateLimiter('aiStreamDaily', {
  windowMs: 24 * 60 * 60 * 1000,
  max: 200,
});

const GEMINI_MODEL = 'gemini-2.0-flash';

/** Hard ceiling on the response. Previously there was no `config` at all. */
const MAX_OUTPUT_TOKENS = 1024;

/** Wall-clock ceiling on one generation, independent of the client. */
const GENERATION_TIMEOUT_MS = 60_000;

/** Longest prompt we will forward. */
const MAX_PROMPT_CHARS = 2_000;

/**
 * Longest slice of the document we will forward as context.
 *
 * `DocEditor` sends `editor.getText()` — the ENTIRE document — and the server
 * used to concatenate it with no truncation. A 2 MB doc is roughly 500k input
 * tokens per keystroke-assist, billed to our key.
 */
const MAX_CONTEXT_CHARS = 8_000;

/** Reject oversized bodies outright rather than parsing them. */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * The endpoint's actual job, stated to the model.
 *
 * Without this the prompt was 100% caller-supplied with only a 3-character
 * minimum — which does not make this a document-editing endpoint, it makes it a
 * general-purpose LLM API for anyone who can register an account, billed to
 * `GEMINI_API_KEY`.
 *
 * A system instruction is not an access control and is not claimed to be; the
 * durable per-user quotas above are what bound the cost. This bounds the
 * *shape* of the output and stops the endpoint reading as an open chat proxy.
 */
const SYSTEM_INSTRUCTION = `You are a writing assistant embedded in the Lumina document editor.
You help the user draft, rewrite, summarise, expand, and edit the text of the document they are working on.
Respond with the document text only — no preamble, no explanation, no markdown code fences.
If a request is not about writing or editing the user's document, reply with a single short sentence saying you can only help with the document.`;

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

  // Cheap pre-parse rejection: refusing a 5 MB body is much cheaper than
  // parsing it. Next route handlers have no default body cap.
  const declaredLength = Number(req.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
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
  if (prompt.length > MAX_PROMPT_CHARS) {
    return NextResponse.json(
      { error: `prompt must be under ${MAX_PROMPT_CHARS} characters` },
      { status: 400 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
  }

  // Truncate server-side. A client-side cap is a suggestion; this is the limit.
  const trimmedContext =
    typeof context === 'string' && context.length > 0
      ? context.slice(0, MAX_CONTEXT_CHARS)
      : '';

  const userContent = trimmedContext
    ? `Document so far:\n${trimmedContext}\n\nUser request:\n${prompt.trim()}`
    : prompt.trim();

  try {
    const ai = new GoogleGenAI({ apiKey });

    /**
     * One controller for every reason this generation should stop: the client
     * navigating away, our own wall-clock ceiling, or the stream being
     * cancelled.
     *
     * Previously the `ReadableStream` defined only `start` — no `cancel` — and
     * `req.signal` was never wired in. When the user navigated away the
     * `for await` loop kept pulling from Gemini until generation completed,
     * fully billed, on a function still holding compute. With no
     * `maxOutputTokens` that could run a long time.
     */
    const ac = new AbortController();
    const abort = () => ac.abort();
    req.signal.addEventListener('abort', abort);
    const timeout = setTimeout(abort, GENERATION_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      req.signal.removeEventListener('abort', abort);
    };

    const stream = new ReadableStream({
      async start(controller) {
        let sawFirstChunk = false;
        let awardPromise: Promise<unknown> | null = null;
        try {
          const response = await ai.models.generateContentStream({
            model: GEMINI_MODEL,
            contents: [{ role: 'user', parts: [{ text: userContent }] }],
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              maxOutputTokens: MAX_OUTPUT_TOKENS,
              temperature: 0.7,
              abortSignal: ac.signal,
            },
          });

          for await (const chunk of response) {
            if (ac.signal.aborted) break;
            const text = chunk.text;
            if (!text) continue;

            if (!sawFirstChunk) {
              sawFirstChunk = true;
              // Award AFTER the first real chunk, not before the call. The
              // award used to run ahead of the request, so a 503 from Gemini
              // still paid out the daily `ai_docs` coin.
              //
              // P2-4: this was `void`-ed and never awaited anywhere, so the
              // platform could tear the function down the moment the stream
              // closed and drop the write. Blocking the FIRST TOKEN on a coin
              // write would still be a visible latency regression, so the
              // promise is started here and awaited in `finally` — the stream
              // is not held up, but the function cannot exit before it lands.
              awardPromise = awardCoins(userId, [
                scopeAward(aiInDocsAward(), { utcDate: utcDateKey(new Date()) }),
              ]).catch((e) => logger.error('unhandled', { route: 'ai-docs coin award' }, e));
            }

            controller.enqueue(new TextEncoder().encode(text));
          }
          controller.close();
        } catch (err) {
          // An abort is the expected end of a cancelled stream, not an error.
          if (ac.signal.aborted) {
            try {
              controller.close();
            } catch {
              /* already closed */
            }
            return;
          }
          logger.error('unhandled', { route: 'AI stream error' }, err);
          controller.error(err);
        } finally {
          // Settle the in-flight coin award before the handler returns, so the
          // serverless function is not frozen mid-write.
          if (awardPromise) await awardPromise;
          cleanup();
        }
      },

      /**
       * Fired when the consumer goes away — a client disconnect, or the
       * platform tearing the response down. This is the hook that actually
       * stops us paying for tokens nobody will read.
       */
      cancel() {
        abort();
        cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'private, no-store, max-age=0',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    logger.error('unhandled', { route: 'POST /api/docs/ai-stream' }, err);
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
  }
}
