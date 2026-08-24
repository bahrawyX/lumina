/**
 * P0-7 — /api/docs/ai-stream was an unmetered, uncapped Gemini proxy.
 *
 * The handler had no `config` object at all (no `maxOutputTokens`, no timeout,
 * no `abortSignal`), no system prompt, no cap on the document it forwarded as
 * context, and no `cancel()` on its ReadableStream — so a client navigating away
 * left the `for await` loop pulling billed tokens until generation finished.
 *
 * These tests drive the real route handler with the Gemini SDK and auth stubbed,
 * so they assert what the handler actually sends and how it behaves on
 * disconnect, rather than re-testing a helper.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const SESSION = { user: { id: 'user-1' } };

const getSession = vi.fn(async () => SESSION as unknown);
vi.mock('@/lib/auth', () => ({ auth: { api: { get getSession() { return getSession; } } } }));

const limiterCheck = vi.fn(async () => ({ limited: false, retryAfterMs: 0, remaining: 10 }));
vi.mock('@/lib/rateLimit', () => ({
  createRateLimiter: () => ({ check: limiterCheck }),
  rateLimitedResponse: (retryAfterMs: number, message?: string) =>
    new Response(JSON.stringify({ error: 'Rate limit exceeded', message }), {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
    }),
  clientIp: () => '1.1.1.1',
}));

const awardCoins = vi.fn(async () => undefined);
vi.mock('@/lib/coins/awardCoins', () => ({ awardCoins: (...a: unknown[]) => awardCoins(...(a as [])) }));
vi.mock('@/lib/coins/dedupeKeys', () => ({
  scopeAward: (a: unknown) => a,
  utcDateKey: () => '2026-08-24',
}));
vi.mock('@/lib/coins/earnRules', () => ({ aiInDocsAward: () => ({ amount: 1, reason: 'ai_docs' }) }));

/** Captures exactly what the handler asked Gemini for. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the captured
// Gemini request is heterogeneous; each assertion narrows to one field.
const generateCalls: Array<Record<string, any>> = [];
let chunkSource: () => AsyncGenerator<{ text: string }>;

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContentStream: async (args: Record<string, unknown>) => {
        generateCalls.push(args);
        return chunkSource();
      },
    };
  },
}));

async function* twoChunks() {
  yield { text: 'hello ' };
  yield { text: 'world' };
}

function makeRequest(body: unknown, init: { signal?: AbortSignal; contentLength?: number } = {}) {
  const serialized = JSON.stringify(body);
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.set('content-length', String(init.contentLength ?? serialized.length));
  return {
    headers,
    signal: init.signal ?? new AbortController().signal,
    json: async () => JSON.parse(serialized),
  } as unknown as import('next/server').NextRequest;
}

let POST: typeof import('@/app/api/docs/ai-stream/route')['POST'];

beforeEach(async () => {
  generateCalls.length = 0;
  chunkSource = twoChunks;
  limiterCheck.mockResolvedValue({ limited: false, retryAfterMs: 0, remaining: 10 });
  awardCoins.mockClear();
  process.env.GEMINI_API_KEY = 'test-key';
  POST = (await import('@/app/api/docs/ai-stream/route')).POST;
});

afterEach(() => {
  vi.clearAllMocks();
});

async function drain(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

describe('P0-7 — the generation is bounded', () => {
  it('sends maxOutputTokens, a temperature and an abortSignal', async () => {
    const res = await POST(makeRequest({ prompt: 'rewrite this' }));
    await drain(res);

    expect(generateCalls).toHaveLength(1);
    const config = generateCalls[0].config;
    // Previously there was no `config` object whatsoever.
    expect(config).toBeDefined();
    expect(config.maxOutputTokens).toBe(1024);
    expect(typeof config.temperature).toBe('number');
    expect(config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('sends a system instruction, so the prompt is not 100% caller-supplied', async () => {
    const res = await POST(makeRequest({ prompt: 'rewrite this' }));
    await drain(res);
    const instruction: string = generateCalls[0].config.systemInstruction;
    expect(instruction).toContain('Lumina document editor');
  });
});

describe('P0-7 — input is capped server-side', () => {
  it('truncates the document context to 8000 characters', async () => {
    // DocEditor sends editor.getText() — the entire document. A 2 MB doc is
    // ~500k input tokens per keystroke-assist, billed to our key.
    const huge = 'x'.repeat(50_000);
    const res = await POST(makeRequest({ prompt: 'summarise', context: huge }));
    await drain(res);

    const text: string = generateCalls[0].contents[0].parts[0].text;
    const contextPortion = text.split('User request:')[0];
    expect(contextPortion.length).toBeLessThan(8_200);
    expect(huge.length).toBeGreaterThan(contextPortion.length);
  });

  it('rejects an over-long prompt with 400', async () => {
    const res = await POST(makeRequest({ prompt: 'y'.repeat(5_000) }));
    expect(res.status).toBe(400);
    expect(generateCalls).toHaveLength(0);
  });

  it('rejects an oversized body with 413 before parsing it', async () => {
    const res = await POST(makeRequest({ prompt: 'hi there' }, { contentLength: 5_000_000 }));
    expect(res.status).toBe(413);
    expect(generateCalls).toHaveLength(0);
  });

  it('still rejects a too-short prompt with 400', async () => {
    const res = await POST(makeRequest({ prompt: 'a' }));
    expect(res.status).toBe(400);
  });
});

describe('P0-7 — coins are awarded for work actually done', () => {
  it('does not award when the upstream call fails', async () => {
    // The award used to run BEFORE the Gemini call, so a request that 503'd
    // still paid out the daily `ai_docs` coin.
    chunkSource = async function* (): AsyncGenerator<{ text: string }> {
      throw new Error('gemini 503');
    };
    const res = await POST(makeRequest({ prompt: 'rewrite this' }));
    await drain(res).catch(() => undefined);
    expect(awardCoins).not.toHaveBeenCalled();
  });

  it('awards once after the first real chunk', async () => {
    const res = await POST(makeRequest({ prompt: 'rewrite this' }));
    const out = await drain(res);
    expect(out).toBe('hello world');
    expect(awardCoins).toHaveBeenCalledTimes(1);
  });
});

describe('P0-7 — a client disconnect stops the upstream generation', () => {
  it('aborts the Gemini signal when the request signal aborts', async () => {
    const controller = new AbortController();

    let observed: AbortSignal | undefined;
    chunkSource = async function* (): AsyncGenerator<{ text: string }> {
      observed = generateCalls[0].config.abortSignal as AbortSignal;
      yield { text: 'partial' };
      // Simulate the client going away mid-generation.
      controller.abort();
      yield { text: 'never read' };
    };

    const res = await POST(makeRequest({ prompt: 'rewrite this' }, { signal: controller.signal }));
    const out = await drain(res);

    expect(observed?.aborted).toBe(true);
    // The loop must stop rather than keep pulling billed tokens.
    expect(out).toBe('partial');
  });

  it('cancelling the response stream aborts upstream', async () => {
    const res = await POST(makeRequest({ prompt: 'rewrite this' }));
    const signal = generateCalls[0].config.abortSignal as AbortSignal;
    expect(signal.aborted).toBe(false);
    await res.body!.cancel();
    expect(signal.aborted).toBe(true);
  });
});

describe('P0-7 — the durable quotas are enforced', () => {
  it('returns 429 with the server message when limited', async () => {
    limiterCheck.mockResolvedValueOnce({ limited: true, retryAfterMs: 30_000, remaining: 0 });
    const res = await POST(makeRequest({ prompt: 'rewrite this' }));
    expect(res.status).toBe(429);
    expect(generateCalls).toHaveLength(0);
  });
});
