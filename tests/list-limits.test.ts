/**
 * P2-7 — missing indexes and unbounded reads.
 *
 * `GET /api/tasks`, `GET /api/events` and `GET /api/focus-sessions` were all
 * unpaginated and unfiltered: they returned every row the user had ever
 * created, on every page load, over a serverless connection. Nothing in the
 * product deletes those rows, so the cost only grows.
 *
 * The index half of P2-7 is covered by the schema/migration parity check at the
 * bottom — eleven declared indexes appeared in no migration when the audit was
 * written, including the docs GIN full-text index and `coin_tx_user_created_idx`.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  listHeaders,
  parseLimit,
} from '@/lib/listLimits';

describe('P2-7 — ?limit is parsed, not trusted', () => {
  it('defaults when absent or empty', () => {
    expect(parseLimit(null)).toEqual({ kind: 'ok', limit: DEFAULT_LIST_LIMIT });
    expect(parseLimit('')).toEqual({ kind: 'ok', limit: DEFAULT_LIST_LIMIT });
  });

  it('accepts a value inside the range', () => {
    expect(parseLimit('50')).toEqual({ kind: 'ok', limit: 50 });
    expect(parseLimit(String(MAX_LIST_LIMIT))).toEqual({ kind: 'ok', limit: MAX_LIST_LIMIT });
  });

  it('rejects rather than clamping an over-large limit', () => {
    // A caller asking for 10,000 and receiving 5,000 with no signal renders a
    // partial list as if it were complete.
    const res = parseLimit(String(MAX_LIST_LIMIT + 1));
    expect(res.kind).toBe('error');
  });

  it('rejects junk that Number() would coerce or parseInt() would salvage', () => {
    for (const bad of ['0', '-1', '1.5', 'abc', '12abc', 'Infinity', 'NaN', ' ']) {
      expect(parseLimit(bad).kind, bad).toBe('error');
    }
  });
});

describe('P2-7 — the response says when it was cut', () => {
  it('reports count and limit on a normal response', () => {
    expect(listHeaders(12, 2000)).toEqual({
      'X-Result-Count': '12',
      'X-Result-Limit': '2000',
    });
  });

  it('flags truncation when the ceiling was reached', () => {
    expect(listHeaders(2000, 2000)['X-Result-Truncated']).toBe('true');
  });

  it('does not flag a list that merely came back full-ish', () => {
    expect(listHeaders(1999, 2000)['X-Result-Truncated']).toBeUndefined();
  });
});

describe('P2-7 — all three list endpoints are bounded', () => {
  const read = (...parts: string[]) =>
    readFileSync(join(process.cwd(), 'src', 'app', 'api', ...parts), 'utf8');

  const ENDPOINTS: Array<[string, string[]]> = [
    ['tasks', ['tasks', 'route.ts']],
    ['events', ['events', 'route.ts']],
    ['focus-sessions', ['focus-sessions', 'route.ts']],
  ];

  for (const [name, parts] of ENDPOINTS) {
    it(`${name} applies a LIMIT and reports truncation`, () => {
      const src = read(...parts);
      expect(src).toContain('parseLimit(searchParams.get(');
      expect(src).toContain('.limit(limit)');
      expect(src).toContain('listHeaders(');
      expect(src).toContain("logger.warn('list truncated'");
    });
  }

  it('events and focus-sessions accept an explicit window', () => {
    for (const parts of [['events', 'route.ts'], ['focus-sessions', 'route.ts']]) {
      const src = read(...parts);
      expect(src).toContain("searchParams.get('from')");
      // Reuses the shared clamp, so an over-wide window is rejected rather than
      // silently truncated — the choice `/api/events/expand` already made.
      expect(src).toContain('parseRange(fromParam, toParam');
    }
  });

  it('the events window matches OVERLAP, not just start time', () => {
    // A multi-day event straddling the boundary has to come back, so a plain
    // `start_time BETWEEN` would drop it from the window it is visible in.
    const src = read('events', 'route.ts');
    expect(src).toContain('gte(events.endTime, window.start)');
    expect(src).toContain('lt(events.startTime, window.end)');
  });

  it('focus-sessions keeps the MOST RECENT rows under the ceiling', () => {
    // A LIMIT on the ascending order would have returned the user's oldest
    // history and hidden everything they did this year.
    const src = read('focus-sessions', 'route.ts');
    expect(src).toContain('desc(focusSessions.startTime)');
    expect(src).toContain('recent.reverse()');
  });

  it('a bad ?status on tasks is a 400, not a silent full scan', () => {
    const src = read('tasks', 'route.ts');
    expect(src).toContain('TASK_STATUSES.includes');
  });

  it('the client says something when the server truncated', () => {
    const src = readFileSync(
      join(process.cwd(), 'src', 'lib', 'persistence', 'apiClient.ts'),
      'utf8',
    );
    expect(src).toContain("res.headers.get('X-Result-Truncated')");
  });
});

describe('P2-7 — every declared index exists in a migration', () => {
  const schemaDir = join(process.cwd(), 'src', 'db', 'schema');
  const migrationDir = join(process.cwd(), 'drizzle');

  const declared = new Set<string>();
  for (const file of readdirSync(schemaDir).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(join(schemaDir, file), 'utf8');
    for (const m of src.matchAll(/(?:unique)?[iI]ndex\(\s*'([^']+)'/g)) {
      declared.add(m[1]);
    }
  }

  const migrations = readdirSync(migrationDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(migrationDir, f), 'utf8'))
    .join('\n');

  it('found the schema indexes to check', () => {
    expect(declared.size).toBeGreaterThan(40);
  });

  it('none is declared in the schema but absent from every migration', () => {
    // Whether an index exists in production must not depend on whether someone
    // ran `drizzle-kit push` by hand. `GET /api/coins` without
    // `coin_tx_user_created_idx` is a seq-scan plus sort on the largest
    // append-only table in the schema.
    const missing = [...declared].filter((name) => !migrations.includes(name)).sort();
    expect(missing).toEqual([]);
  });

  it('carries the composite indexes the hot task queries need', () => {
    expect(migrations).toContain('tasks_user_status_position_idx');
    expect(migrations).toContain('tasks_user_due_idx');
  });

  it('carries the docs full-text index and the coin ledger index', () => {
    expect(migrations).toMatch(/USING gin/i);
    expect(migrations).toContain('coin_tx_user_created_idx');
  });
});
