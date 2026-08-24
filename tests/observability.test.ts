/**
 * P0-5 — nothing told you when production broke.
 *
 * There were 76 bare `console.*` calls across `src/app/api/**` with no request
 * id, user id or consistent route tag; no health check; no CI; and the error
 * boundary read neither `error` nor `error.digest`.
 *
 * These tests pin the parts that are checkable without a deployment: the log
 * format, the absence of bare console calls in the API layer, and the fact that
 * the two routes which leaked error detail to clients no longer do.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const API_DIR = join(process.cwd(), 'src', 'app', 'api');
const API_FILES = walk(API_DIR);

describe('P0-5 — the API layer no longer logs unstructured', () => {
  it('has zero bare console.* calls left', () => {
    const offenders: string[] = [];
    for (const file of API_FILES) {
      const src = readFileSync(file, 'utf8');
      const matches = src.match(/console\.(error|warn|log|info|debug)\(/g);
      if (matches) {
        offenders.push(`${file.replace(process.cwd(), '')} (${matches.length})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every API file that logs imports the shared logger', () => {
    for (const file of API_FILES) {
      const src = readFileSync(file, 'utf8');
      if (!/\blogger\.(error|warn|info|debug)\(/.test(src)) continue;
      expect(src, `${file} uses logger without importing it`).toMatch(
        /from '@\/lib\/logger'/,
      );
    }
  });
});

describe('P3-4 — error detail is never returned to the client', () => {
  it('no route attaches a detail field gated on NODE_ENV', () => {
    // `goals/route.ts` and `goals/[id]/route.ts` did:
    //   detail: process.env.NODE_ENV !== 'production' ? String(err.message) : undefined
    // Safe on Vercel (preview builds are 'production') but a real leak on any
    // self-hosted or staging deployment.
    const offenders = API_FILES.filter((f) =>
      /detail:\s*process\.env\.NODE_ENV/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

describe('P0-5 — error boundaries report', () => {
  it('the app boundary reads error.digest', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', '(app)', 'error.tsx'), 'utf8');
    // Previously the `error` prop and its `digest` were never read at all.
    expect(src).toContain('error.digest');
    expect(src).toMatch(/useEffect/);
  });

  it('a root global-error boundary exists', () => {
    // There was none, so a failure in the root layout produced Next's default
    // screen and reported nothing.
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'global-error.tsx'), 'utf8');
    expect(src).toContain('error.digest');
    expect(src).toContain('<html');
  });
});

describe('P0-5 — the structured logger', () => {
  const original = { error: console.error, warn: console.warn, log: console.log };
  let captured: string[];

  beforeEach(() => {
    captured = [];
    const sink = (...args: unknown[]) => captured.push(String(args[0]));
    console.error = sink as typeof console.error;
    console.warn = sink as typeof console.warn;
    console.log = sink as typeof console.log;
    vi.resetModules();
    // `NODE_ENV` is typed read-only; the logger reads it at module scope, so the
    // production JSON path can only be exercised by setting it before import.
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    console.error = original.error;
    console.warn = original.warn;
    console.log = original.log;
    vi.unstubAllEnvs();
  });

  it('emits one line of parseable JSON with the context fields', async () => {
    const { logger } = await import('@/lib/logger');
    logger.error('unhandled', { route: 'GET /api/tasks', userId: 'u-1', requestId: 'r-1' },
      new Error('boom'));

    expect(captured).toHaveLength(1);
    expect(captured[0]).not.toContain('\n');

    const line = JSON.parse(captured[0]);
    expect(line.level).toBe('error');
    expect(line.msg).toBe('unhandled');
    expect(line.route).toBe('GET /api/tasks');
    expect(line.userId).toBe('u-1');
    expect(line.requestId).toBe('r-1');
    expect(line.err.message).toBe('boom');
    expect(line.err.stack).toBeTruthy();
    expect(typeof line.ts).toBe('string');
  });

  it('serialises a non-Error throwable without losing it', async () => {
    const { logger } = await import('@/lib/logger');
    logger.error('unhandled', { route: 'x' }, 'a string was thrown');
    const line = JSON.parse(captured[0]);
    expect(line.err.message).toBe('a string was thrown');
  });

  it('apiError returns a fixed 500 body and never the detail', async () => {
    const { apiError } = await import('@/lib/logger');
    const res = apiError('GET /api/tasks', new Error('connection string leaked here'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(body)).not.toContain('connection string');
    // ...but it IS in the log.
    expect(captured[0]).toContain('connection string leaked here');
  });

  it('debug is silent outside development', async () => {
    const { logger } = await import('@/lib/logger');
    logger.debug('noisy', { route: 'x' });
    expect(captured).toHaveLength(0);
  });
});

describe('P0-5 — CI exists and runs the four checks', () => {
  const workflow = readFileSync(
    join(process.cwd(), '.github', 'workflows', 'ci.yml'),
    'utf8',
  );

  for (const [name, needle] of [
    ['typecheck', 'tsc --noEmit'],
    ['tests', 'vitest run'],
    ['lint', 'eslint'],
    ['build', 'next build'],
  ] as const) {
    it(`runs ${name}`, () => {
      expect(workflow).toContain(needle);
    });
  }

  it('installs from the lockfile rather than resolving fresh', () => {
    expect(workflow).toContain('npm ci');
  });
});
