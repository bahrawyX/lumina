/**
 * `'gemini-2.0-flash'` was hardcoded in four route files. Google retired it and
 * every AI feature failed at once:
 *
 *     404 This model models/gemini-2.0-flash is no longer available.
 *     Please update your code to use models/gemini-3.6-flash
 *
 * Caught from the dev server's own logs while the app was in use — the daily
 * brief swallows the failure into a fallback string, so nothing on screen said
 * the narrative had stopped being generated.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

function apiRoutes(dir = resolve(root, 'src/app/api')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? apiRoutes(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
}

const ORIGINAL = process.env.GEMINI_MODEL;

beforeEach(() => {
  vi.resetModules();
  delete process.env.GEMINI_MODEL;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = ORIGINAL;
});

describe('the Gemini model is defined once', () => {
  it('no route hardcodes a model name any more', () => {
    // Four separate outages from one upstream change is what duplication buys.
    const offenders = apiRoutes()
      .filter((f) => /model:\s*['"]gemini-/.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(root, ''));
    expect(offenders).toEqual([]);
  });

  it('and none of them still names the retired one', () => {
    const offenders = apiRoutes()
      .filter((f) => readFileSync(f, 'utf8').includes('gemini-2.0-flash'))
      .map((f) => f.replace(root, ''));
    expect(offenders).toEqual([]);
  });

  it('every route that calls Gemini imports the shared constant', () => {
    const callers = apiRoutes().filter((f) => readFileSync(f, 'utf8').includes('GoogleGenAI'));
    expect(callers.length).toBeGreaterThanOrEqual(4);
    for (const f of callers) {
      expect(readFileSync(f, 'utf8'), f.replace(root, '')).toContain(
        "from '@/lib/ai/geminiModel'",
      );
    }
  });
});

describe('the model can be changed without a deploy', () => {
  it('defaults to the replacement Google named', async () => {
    const { GEMINI_MODEL } = await import('@/lib/ai/geminiModel');
    expect(GEMINI_MODEL).toBe('gemini-3.6-flash');
  });

  it('honours GEMINI_MODEL when set', async () => {
    // The next retirement should be a config change, not a release.
    process.env.GEMINI_MODEL = 'gemini-4.0-flash';
    const { GEMINI_MODEL } = await import('@/lib/ai/geminiModel');
    expect(GEMINI_MODEL).toBe('gemini-4.0-flash');
  });

  it('ignores an empty or whitespace value rather than sending it upstream', async () => {
    // An unset variable in a deploy config usually arrives as '', which would
    // otherwise produce a request for a model literally named "".
    process.env.GEMINI_MODEL = '   ';
    const { GEMINI_MODEL } = await import('@/lib/ai/geminiModel');
    expect(GEMINI_MODEL).toBe('gemini-3.6-flash');
  });

  it('is documented in .env.example', () => {
    expect(read('.env.example')).toContain('GEMINI_MODEL');
  });
});
