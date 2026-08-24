/**
 * NOTE: deliberately NOT `import 'server-only'`.
 *
 * `db.ts` and `rateLimit.ts` carry that guard because they hold a connection
 * string and touch the database. This module holds nothing: it formats a string
 * and calls `console`. Guarding it bought no safety and cost a growing
 * exception list in `vitest.config.ts` — every test that imports a route
 * handler now transitively imports this file, and each one had to be moved into
 * the server-only-stub project just to run. That erodes the guard everywhere
 * else, which is the opposite of what it is for.
 */

/**
 * Structured, single-line-JSON server logging.
 *
 * ## Why
 *
 * There were 76 bare `console.*` calls across `src/app/api/**`, all of this
 * shape:
 *
 *     console.error('[GET /api/achievements]', err);
 *
 * No request id, no user id, no route tag beyond a hand-written prefix, and no
 * consistent field for the error itself. On Vercel Hobby, log retention is short
 * and not searchable across deployments — so in practice a production failure
 * left a line nobody could find, correlate, or alert on.
 *
 * Several findings in the audit are *silent* failures: a cron truncating
 * part-way through the user list, per-calendar sync errors being swallowed,
 * coin awards lost to fire-and-forget. Every one of them was undetectable.
 * Structured logs are the cheapest thing that makes them visible.
 *
 * ## Shape
 *
 * One JSON object per line, so any log drain can parse it without a grok
 * pattern:
 *
 *     {"level":"error","msg":"unhandled","route":"GET /api/tasks",
 *      "userId":"…","requestId":"…","err":{"name":"…","message":"…","stack":"…"},
 *      "ts":"2026-08-24T09:15:00.000Z"}
 *
 * In development it prints human-readable lines instead, because a wall of JSON
 * in a terminal is worse than the `console.error` it replaced.
 *
 * ## PII
 *
 * `userId` is an opaque UUID and is safe to log. Nothing here serialises a
 * request body, a document, a task title, an email address or a token — those
 * are the fields that turn a log drain into a data-protection problem. Callers
 * pass explicit context; there is no "log the whole object" escape hatch on
 * purpose.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  /** `"GET /api/tasks"` — method plus route pattern, never a filled-in id. */
  route?: string;
  /** Opaque user UUID. Safe: it identifies a row, not a person. */
  userId?: string;
  /** Correlates every line emitted while handling one request. */
  requestId?: string;
  /** Anything else scalar and non-sensitive: counts, durations, statuses. */
  [key: string]: string | number | boolean | undefined;
}

const isDev = process.env.NODE_ENV === 'development';

/** Serialise an unknown throwable without losing the parts that matter. */
function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      // Stacks are large; keep them, but they are the only reason this is
      // useful at 3am.
      stack: err.stack,
      ...(err.cause ? { cause: String(err.cause) } : {}),
    };
  }
  return { message: String(err) };
}

function emit(level: LogLevel, msg: string, ctx?: LogContext, err?: unknown): void {
  const line: Record<string, unknown> = {
    level,
    msg,
    ...ctx,
    ...(err !== undefined ? { err: serializeError(err) } : {}),
    ts: new Date().toISOString(),
  };

  if (isDev) {
    const prefix = ctx?.route ? `[${ctx.route}]` : '[lumina]';
    const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    sink(prefix, msg, err ?? '');
    return;
  }

  // Single line, so a drain never has to reassemble a multi-line record.
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(JSON.stringify(line));
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => {
    if (isDev) emit('debug', msg, ctx);
  },
  info: (msg: string, ctx?: LogContext) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext, err?: unknown) => emit('warn', msg, ctx, err),
  error: (msg: string, ctx?: LogContext, err?: unknown) => emit('error', msg, ctx, err),
};

/**
 * A request id for correlating every line from one request.
 *
 * Vercel sets `x-vercel-id`; we fall back to a random one so local and
 * self-hosted runs still correlate.
 */
export function requestId(headers: Headers): string {
  return (
    headers.get('x-vercel-id') ??
    headers.get('x-request-id') ??
    globalThis.crypto?.randomUUID?.() ??
    'unknown'
  );
}

/**
 * The standard 500 for an API route: log the detail, return a fixed string.
 *
 * There were 52 copy-pasted `'Internal server error'` blocks, two of which
 * additionally leaked `detail: String(err.message)` whenever
 * `NODE_ENV !== 'production'` — safe on Vercel (preview builds are
 * `production`) but a real footgun for any self-hosted or staging deployment.
 * Routing them all through here means the detail can never reach the client by
 * accident.
 */
export function apiError(route: string, err: unknown, ctx?: LogContext): Response {
  logger.error('unhandled', { route, ...ctx }, err);
  return new Response(JSON.stringify({ error: 'Internal server error' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}
