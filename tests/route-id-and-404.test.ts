/**
 * P2-1 — malformed route ids returned 500 instead of 400.
 * P2-2 — PATCH/DELETE reported success for records that don't exist.
 *
 * Every primary key is a `uuid` and `params.id` went straight into
 * `eq(table.id, id)` with no shape check, so Postgres raised `22P02` and the
 * client got a generic 500. Confirmed live by the audit:
 *
 *     PATCH /api/tasks/not-a-uuid  -> 500
 *     GET   /api/docs/not-a-uuid   -> 500
 *
 * And the write handlers issued their statement and returned success without
 * inspecting the affected row count, so
 * `PATCH /api/tasks/00000000-0000-0000-0000-000000000000` answered
 * `200 {"ok":true}`. Ownership *is* enforced — the write matches zero rows — so
 * this was never a security hole; the API just reported success for a no-op and
 * the client could not detect a lost write.
 */
import { describe, it, expect } from 'vitest';
import {
  invalidIdResponse,
  parseEventRouteId,
  parseRouteId,
} from '@/lib/routeParams';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const VALID = '3f7c1a9e-2b5d-4c8f-9a1e-6d0b2c4e8f13';

describe('P2-1 — route ids are validated before they reach Postgres', () => {
  it('accepts a real uuid', () => {
    expect(parseRouteId(VALID)).toBe(VALID);
  });

  it('rejects the shapes that produced 22P02', () => {
    for (const bad of ['not-a-uuid', '123', '', 'null', 'undefined', "'; DROP TABLE tasks;--"]) {
      expect(parseRouteId(bad), bad).toBeNull();
    }
  });

  it('rejects a missing param rather than coercing it', () => {
    expect(parseRouteId(undefined)).toBeNull();
    expect(parseRouteId(null)).toBeNull();
  });

  it('returns a 400, not a 500', async () => {
    const res = invalidIdResponse();
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid id' });
  });
});

describe('P2-1 — events accepts the composite masterId:isoDate form', () => {
  it('parses a plain uuid', () => {
    expect(parseEventRouteId(VALID)).toEqual({ masterId: VALID, occurrenceDate: null });
  });

  it('parses masterId:isoDate and keeps both halves', () => {
    const composite = `${VALID}:2026-08-24T15:00:00.000Z`;
    expect(parseEventRouteId(composite)).toEqual({
      masterId: VALID,
      occurrenceDate: '2026-08-24T15:00:00.000Z',
    });
  });

  it('rejects a composite whose master half is not a uuid', () => {
    expect(parseEventRouteId('nope:2026-08-24T15:00:00.000Z')).toBeNull();
  });

  it('rejects a composite whose date half is unparseable', () => {
    expect(parseEventRouteId(`${VALID}:not-a-date`)).toBeNull();
  });

  it('rejects an empty occurrence half', () => {
    expect(parseEventRouteId(`${VALID}:`)).toBeNull();
  });
});

describe('P2-1 / P2-2 — the handlers actually use them', () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), 'src', 'app', 'api', ...parts), 'utf8');

  const ID_ROUTES: Array<[string, string[]]> = [
    ['tasks/[id]', ['tasks', '[id]', 'route.ts']],
    ['docs/[id]', ['docs', '[id]', 'route.ts']],
    ['goals/[id]', ['goals', '[id]', 'route.ts']],
    ['goals/[id]/targets', ['goals', '[id]', 'targets', 'route.ts']],
    ['goals/[id]/targets/[targetId]', ['goals', '[id]', 'targets', '[targetId]', 'route.ts']],
    ['planner-items/[id]', ['planner-items', '[id]', 'route.ts']],
    ['focus-sessions/[id]', ['focus-sessions', '[id]', 'route.ts']],
    ['integrations/calendars/[id]', ['integrations', 'calendars', '[id]', 'route.ts']],
  ];

  for (const [name, parts] of ID_ROUTES) {
    it(`${name} validates its id`, () => {
      const src = read(...parts);
      expect(src).toContain('parseRouteId');
      expect(src).toContain('invalidIdResponse');
    });
  }

  it('events/[id] uses the composite parser', () => {
    const src = read('events', '[id]', 'route.ts');
    expect(src).toContain('parseEventRouteId');
    expect(src).toContain('invalidIdResponse');
  });

  const WRITE_ROUTES: Array<[string, string[]]> = [
    ['tasks/[id]', ['tasks', '[id]', 'route.ts']],
    ['docs/[id]', ['docs', '[id]', 'route.ts']],
    ['goals/[id]', ['goals', '[id]', 'route.ts']],
    ['planner-items/[id]', ['planner-items', '[id]', 'route.ts']],
    ['focus-sessions/[id]', ['focus-sessions', '[id]', 'route.ts']],
  ];

  for (const [name, parts] of WRITE_ROUTES) {
    it(`${name} inspects the affected row count and can 404`, () => {
      const src = read(...parts);
      // `.returning()` is what turns "the statement ran" into "a row changed".
      expect(src).toContain('.returning({');
      expect(src).toContain('status: 404');
    });
  }
});
