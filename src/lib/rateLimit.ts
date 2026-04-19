import 'server-only';

/**
 * Simple in-memory sliding-window rate limiter.
 *
 * WARNING: this is per-instance memory. For production behind a load balancer
 * or serverless platform with multiple warm instances, replace with a Redis-
 * backed limiter. The current in-memory version still raises the cost of
 * abuse meaningfully (an attacker has to pay for many more parallel invokes
 * to burst past the cap) and is materially better than no limit.
 *
 * Usage:
 *   const limiter = createRateLimiter('parseEvent', { windowMs: 60_000, max: 20 });
 *   if (limiter.check(userId).limited) return 429;
 */

interface LimiterOptions {
  windowMs: number;
  max: number;
}

interface LimiterCheck {
  limited: boolean;
  /** Milliseconds until the oldest entry falls out of the window. */
  retryAfterMs: number;
}

const BUCKETS = new Map<string, Map<string, number[]>>();

export function createRateLimiter(name: string, opts: LimiterOptions) {
  if (!BUCKETS.has(name)) BUCKETS.set(name, new Map());
  const bucket = BUCKETS.get(name)!;

  return {
    check(key: string): LimiterCheck {
      const now = Date.now();
      const timestamps = bucket.get(key) ?? [];
      const recent = timestamps.filter((t) => now - t < opts.windowMs);
      bucket.set(key, recent);

      if (recent.length >= opts.max) {
        const oldest = recent[0];
        return {
          limited: true,
          retryAfterMs: Math.max(0, opts.windowMs - (now - oldest)),
        };
      }

      recent.push(now);
      return { limited: false, retryAfterMs: 0 };
    },
  };
}

/**
 * Convenience: produce a 429 Response with a Retry-After header.
 */
export function rateLimitedResponse(retryAfterMs: number): Response {
  const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return new Response(
    JSON.stringify({ error: 'Rate limit exceeded' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
      },
    },
  );
}
