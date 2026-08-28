/**
 * P2-2, P1-4, P3-3, and the schema drift the timezone backfill would have
 * reintroduced.
 *
 * The theme is writes that report success without doing anything, and failures
 * that are computed and then thrown away.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

const codeOf = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

describe('P2-2 — a write that matched nothing is not a success', () => {
  it('the goals PATCH returns 404 instead of {ok:true}', () => {
    // `db.update()` matching zero rows is not an error in Drizzle, so a PATCH
    // against a deleted goal — or another user's — updated nothing and still
    // answered `{ ok: true }`.
    const src = codeOf(read('src/app/api/goals/[id]/route.ts'));
    expect(src).toContain('.returning({ id: goals.id })');
    expect(src).toContain('if (updated.length === 0)');
    expect(src).toMatch(/status: 404/);
  });

  it('and it checks the UPDATE, not the SELECT above it', () => {
    // A `prev`-based guard would still pass for a goal deleted between the two
    // statements, and write nothing.
    const src = read('src/app/api/goals/[id]/route.ts');
    const guard = src.slice(src.indexOf('const updated = await db'));
    expect(guard.indexOf('if (updated.length === 0)')).toBeGreaterThan(0);
    expect(guard.indexOf('if (updated.length === 0)')).toBeLessThan(
      guard.indexOf('newBalance') === -1 ? Infinity : guard.indexOf('newBalance'),
    );
  });

  it("the events DELETE 'this_and_following' no longer falls through", () => {
    // `recRows.length === 0` fell past the `if` straight to `{ ok: true }`, so
    // deleting a series the user does not own reported success and truncated
    // nothing.
    const src = codeOf(read('src/app/api/events/[id]/route.ts'));
    expect(src).toContain('if (recRows.length === 0)');
    expect(src).toContain("error: 'Recurring event not found'");
  });
});

describe('P1-4 — linkedTaskId is verified on every path, not one', () => {
  const src = read('src/app/api/events/[id]/route.ts');
  const code = codeOf(src);

  it('the check runs before the edit-scope branch', () => {
    // It lived ~200 lines below, on the main UPDATE path only. The two
    // recurrence-exception INSERTs wrote the body value straight through, so a
    // caller could attach another user's task to their own event by editing a
    // single occurrence.
    const check = code.indexOf('eq(tasks.id, linkedTaskId), eq(tasks.userId, userId)');
    const firstBranch = code.indexOf("if (editScope === 'this'");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(firstBranch);
  });

  it('there is exactly one ownership query for it', () => {
    // Two would mean the hoisted one was added without removing the old.
    const matches = code.match(/eq\(tasks\.id, linkedTaskId\), eq\(tasks\.userId, userId\)/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('and the exception inserts still write the field', () => {
    // The fix must not have silently dropped the feature.
    const writes = code.match(/linkedTaskId: typeof linkedTaskId === 'string'/g) ?? [];
    expect(writes).toHaveLength(2);
  });
});

describe('P3-3 — the cause is recorded, not only the enum', () => {
  const routes = [
    'src/app/api/sync/all/route.ts',
    'src/app/api/external-events/all/route.ts',
    'src/app/api/integrations/[provider]/calendars/route.ts',
    'src/app/api/external-events/[provider]/route.ts',
  ];

  it('every provider route logs the error it swallows', () => {
    // Three of the four computed a safe client code and discarded `err`
    // entirely — so the client learned nothing (correct) and so did the
    // operator (not correct).
    for (const route of routes) {
      const src = read(route);
      expect(src, route).toContain("from '@/lib/logger'");
      expect(src, route).toMatch(/logger\.error\(/);
    }
  });

  it('and none of them returns a raw provider message', () => {
    for (const route of routes) {
      const src = codeOf(read(route));
      expect(src, route).not.toMatch(/error:\s*err\.message/);
      expect(src, route).not.toMatch(/error:\s*message\b/);
    }
  });
});

describe('P0-1 — the backfill marker exists in the schema, not only the script', () => {
  it('the column the script depends on is declared', () => {
    // `scripts/backfill-event-timezones.sql` does `ADD COLUMN IF NOT EXISTS
    // tz_backfilled_at` and every step filters on it being NULL — that filter
    // is the only thing making the script safe to run twice. It was in no
    // migration and no schema, so `drizzle-kit generate` after a production
    // run would have emitted a DROP COLUMN for it.
    expect(read('scripts/backfill-event-timezones.sql')).toContain('tz_backfilled_at');
    expect(read('src/db/schema/events.ts')).toContain(
      "tzBackfilledAt: timestamp('tz_backfilled_at', { withTimezone: true })",
    );
  });

  it('and a migration creates it', () => {
    const files = readdirSync(join(root, 'drizzle')).filter((f) => f.endsWith('.sql'));
    const creating = files.filter((f) =>
      readFileSync(join(root, 'drizzle', f), 'utf8').includes('"tz_backfilled_at"'),
    );
    expect(creating).toHaveLength(1);
  });

  it('the journal still has one entry per migration file', () => {
    // The P0-1 invariant. Adding a .sql without journalling it means
    // `drizzle-kit migrate` never runs it.
    const files = readdirSync(join(root, 'drizzle')).filter((f) => f.endsWith('.sql'));
    const journal = JSON.parse(read('drizzle/meta/_journal.json')) as { entries: unknown[] };
    expect(journal.entries).toHaveLength(files.length);
  });
});
