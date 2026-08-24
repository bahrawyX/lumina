/**
 * P2-11 — `/api/docs/search` broke on ordinary punctuation.
 * P3-1  — authenticated JSON was served with `Cache-Control: public`.
 * P3-2  — no request body size limit, and no field length limits.
 * P3-5  — `PATCH /api/achievements` accepted an unbounded id array.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { buildDocsPrefixQuery } from '@/lib/docs/searchQuery';
import { checkFieldLengths, exceedsLength, FIELD_LIMITS } from '@/lib/fieldLimits';
import { contactEmailSchema, emailSchema } from '@/lib/validation';

describe('P2-11 — the search query survives what users actually type', () => {
  let pg: PGlite;
  beforeAll(async () => {
    pg = new PGlite();
  });
  afterAll(async () => {
    await pg.close();
  });

  /** Run the argument through the real `to_tsquery` the route calls. */
  const compile = async (raw: string) => {
    const arg = buildDocsPrefixQuery(raw);
    if (arg === null) return null;
    const res = await pg.query<{ t: string }>(`SELECT to_tsquery('english', $1)::text AS t`, [arg]);
    return res.rows[0].t;
  };

  it('still does prefix matching, which is the whole point of the box', async () => {
    // This is why the fix is not `websearch_to_tsquery`: that function never
    // raises, but it also cannot emit a prefix, so "quar" would stop matching
    // "quarterly" and search-as-you-type would break for every partial word.
    expect(await compile('quar')).toBe("'quar':*");
    expect(await compile('quarterly review')).toBe("'quarter':* & 'review':*");
  });

  it('compiles the punctuation that used to raise syntax errors', async () => {
    // Every one of these produced `syntax error in tsquery` → 500, mid-word,
    // in a box that searches on every keystroke.
    const previouslyFatal = ['why?!', 'foo & bar', 'a:b', '(x)', 'c++', 'a<->b'];
    for (const q of previouslyFatal) {
      await expect(compile(q), q).resolves.not.toThrow?.();
      expect(typeof (await compile(q)), q).toBe('string');
    }
  });

  it('reports "nothing searchable" instead of building an invalid query', async () => {
    // `''` and `'   '` compiled to `':*'` and `':* & :*'` — both syntax errors.
    for (const q of ['', '   ', '!', '&|', '***', '()']) {
      expect(buildDocsPrefixQuery(q), q).toBeNull();
    }
  });

  it('keeps non-ASCII words intact', async () => {
    expect(await compile('naïve café')).toBe("'naïv':* & 'café':*");
  });

  it('bounds how much query a single request can build', () => {
    const arg = buildDocsPrefixQuery(Array.from({ length: 200 }, (_, i) => `w${i}`).join(' '));
    expect(arg?.split(' & ')).toHaveLength(8);
  });

  it('bounds a single absurd term', () => {
    const arg = buildDocsPrefixQuery('x'.repeat(5000));
    expect(arg).toBe(`${'x'.repeat(64)}:*`);
  });

  it('the route asks for an empty result rather than querying', () => {
    const src = readFileSync(
      join(process.cwd(), 'src', 'app', 'api', 'docs', 'search', 'route.ts'),
      'utf8',
    );
    expect(src).toContain('buildDocsPrefixQuery(q)');
    expect(src).not.toContain("q.replace(/\\s+/g, ':* & ')");
  });
});

describe('P3-2 — field lengths are a 400, not a driver 500', () => {
  it('mirrors the schema widths', () => {
    // `tasks.title`, `docs.title`, `events.title` are all varchar(512);
    // `goals.title` and `goal_targets.title` are varchar(255).
    expect(FIELD_LIMITS.title).toBe(512);
    expect(FIELD_LIMITS.shortTitle).toBe(255);
  });

  it('accepts a value exactly at the limit', () => {
    expect(exceedsLength('x'.repeat(512), FIELD_LIMITS.title)).toBe(false);
  });

  it('rejects one character past it', () => {
    expect(exceedsLength('x'.repeat(513), FIELD_LIMITS.title)).toBe(true);
  });

  it('ignores non-strings rather than guessing', () => {
    expect(exceedsLength(undefined, 10)).toBe(false);
    expect(exceedsLength(null, 10)).toBe(false);
    expect(exceedsLength(12345678901234, 10)).toBe(false);
  });

  it('returns a 400 naming the field and the limit', async () => {
    const res = checkFieldLengths({ title: { value: 'x'.repeat(600), max: 512 } });
    expect(res?.status).toBe(400);
    await expect(res?.json()).resolves.toEqual({
      error: 'title must be at most 512 characters',
    });
  });

  it('passes when every field fits', () => {
    expect(
      checkFieldLengths({
        title: { value: 'Ship it', max: 512 },
        description: { value: undefined, max: 10_000 },
      }),
    ).toBeNull();
  });

  it('is applied at every route that writes a bounded column', () => {
    const read = (...parts: string[]) =>
      readFileSync(join(process.cwd(), 'src', 'app', 'api', ...parts), 'utf8');
    for (const parts of [
      ['tasks', 'route.ts'],
      ['tasks', '[id]', 'route.ts'],
      ['events', 'route.ts'],
      ['goals', 'route.ts'],
      ['goals', '[id]', 'route.ts'],
      ['docs', '[id]', 'route.ts'],
    ]) {
      expect(read(...parts), parts.join('/')).toContain('checkFieldLengths(');
    }
  });
});

describe('P3-2 — the contact reply-to is validated', () => {
  it('accepts a normal address', () => {
    expect(contactEmailSchema.parse('  someone@example.com ')).toBe('someone@example.com');
  });

  it('rejects a header-injection payload', () => {
    // A newline in a reply-to address is how header injection starts. Stripping
    // the CRLF leaves `a@b.comBcc: victim@example.com`, which is then rejected
    // as malformed — so the value never reaches the database in either form.
    expect(contactEmailSchema.safeParse('a@b.com\r\nBcc: victim@example.com').success)
      .toBe(false);
  });

  it('accepts an address that merely picked up a stray newline', () => {
    expect(contactEmailSchema.parse('someone@example.com\n')).toBe('someone@example.com');
  });

  it('rejects an unbounded local part', () => {
    expect(emailSchema.safeParse(`${'a'.repeat(300)}@example.com`).success).toBe(false);
  });

  it('rejects a non-address', () => {
    expect(contactEmailSchema.safeParse('not-an-email').success).toBe(false);
  });
});

describe('P3-1 / P3-2 — the edge stamps cache headers and caps bodies', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'proxy.ts'), 'utf8');

  it('marks API JSON private and varies on the cookie', () => {
    // Vercel's default is `public, max-age=0, must-revalidate` with no Vary,
    // which marks PER-USER JSON as shared-cacheable.
    expect(src).toContain("'Cache-Control', 'private, no-store, max-age=0'");
    expect(src).toContain("'Vary', 'Cookie, Accept-Encoding'");
  });

  it('caps request bodies, with a larger allowance for documents', () => {
    expect(src).toContain('MAX_BODY_BYTES');
    expect(src).toContain('MAX_DOC_BODY_BYTES');
    expect(src).toContain('status: 413');
  });

  it('applies the cap before the CSRF exemption, so /api/auth is covered too', () => {
    expect(src.indexOf('bodyLimitFor(req.nextUrl.pathname)')).toBeLessThan(
      src.indexOf('if (isExempt(req.nextUrl.pathname)) return pass();'),
    );
  });
});

describe('P3-5 — the achievements id array is bounded and typed', () => {
  const src = readFileSync(
    join(process.cwd(), 'src', 'app', 'api', 'achievements', 'route.ts'),
    'utf8',
  );

  it('validates with zod rather than Array.isArray', () => {
    // A non-UUID entry raised 22P02 → 500; a 100k-element array became a
    // 100k-term IN clause.
    expect(src).toContain('markSeenSchema.safeParse(body.ids)');
    expect(src).toContain('.max(200,');
    expect(src).toContain('z.string().uuid(');
  });

  it('still scopes the update by user', () => {
    expect(src).toContain('eq(achievements.userId, session.user.id)');
  });
});
