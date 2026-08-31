/**
 * "Delete this occurrence" has to record the instant it deleted.
 *
 * `events/[id]` accepts a composite id for a single occurrence of a series:
 *
 *     <masterUuid>:<isoInstant>
 *
 * and an ISO instant contains colons of its own. So this, which the PATCH and
 * DELETE handlers both did:
 *
 *     const [masterEventId, instanceStartIso] = id.split(':');
 *
 * splits `<uuid>:2026-09-07T09:00:00.000Z` into FOUR parts and binds
 * `instanceStartIso` to `"2026-09-07T09"`. `new Date("2026-09-07T09")` is an
 * Invalid Date.
 *
 * For DELETE that string is written straight into the series' `exdates`, which
 * is the record of "this occurrence is gone". `rruleEngine` replays it as
 * `ruleSet.exdate(new Date(exdate))` — an Invalid Date excludes nothing — so
 * the deleted occurrence reappeared on the next expand. That is precisely the
 * symptom the P2-2 comment in the same handler describes; that fix addressed
 * the ownership half and left the parsing wrong.
 *
 * `parseEventRouteId` had always done it correctly — split on the FIRST colon,
 * validate the remainder parses — and was already being called at the top of
 * both handlers for validation. Its result was thrown away. The check passed on
 * the full string while the handler worked from the truncated one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEventRouteId } from '@/lib/routeParams';

const MASTER = '3f56d1f6-507c-4e92-898c-d72c22bd26c3';
const INSTANT = '2026-09-07T09:00:00.000Z';
const COMPOSITE = `${MASTER}:${INSTANT}`;

describe('the naive split is genuinely broken', () => {
  it('produces four parts, not two', () => {
    expect(COMPOSITE.split(':')).toHaveLength(4);
  });

  it('truncates the instant at the first colon', () => {
    const [, instanceStartIso] = COMPOSITE.split(':');
    expect(instanceStartIso).toBe('2026-09-07T09');
  });

  it('and that truncation is an Invalid Date', () => {
    const [, instanceStartIso] = COMPOSITE.split(':');
    expect(Number.isNaN(new Date(instanceStartIso).getTime())).toBe(true);
  });
});

describe('parseEventRouteId keeps the whole instant', () => {
  it('returns the master and the full ISO', () => {
    const parsed = parseEventRouteId(COMPOSITE);
    expect(parsed).not.toBeNull();
    expect(parsed!.masterId).toBe(MASTER);
    expect(parsed!.occurrenceDate).toBe(INSTANT);
  });

  it('round-trips to the same instant', () => {
    // The property that matters: what gets stored as an exdate must parse back
    // to the moment the occurrence actually starts, or it excludes nothing.
    const parsed = parseEventRouteId(COMPOSITE)!;
    expect(new Date(parsed.occurrenceDate!).toISOString()).toBe(INSTANT);
  });

  it('still handles a plain uuid', () => {
    const parsed = parseEventRouteId(MASTER);
    expect(parsed).toEqual({ masterId: MASTER, occurrenceDate: null });
  });

  it('rejects a non-uuid master', () => {
    expect(parseEventRouteId(`not-a-uuid:${INSTANT}`)).toBeNull();
  });

  it('rejects an unparseable occurrence', () => {
    expect(parseEventRouteId(`${MASTER}:tuesday`)).toBeNull();
  });
});

describe('the handler uses the parse it already made', () => {
  const route = readFileSync(
    join(process.cwd(), 'src', 'app', 'api', 'events', '[id]', 'route.ts'), 'utf8',
  );
  const code = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('never re-splits the raw id', () => {
    // Three sites did this. Two truncated the instant; the third took `[0]`
    // and was accidentally correct. All three are one parser now, so nobody
    // copies the broken form from the working one.
    expect(code).not.toMatch(/id\.split\(':'\)/);
  });

  it('reads the occurrence from parsedId', () => {
    expect(code).toMatch(/parsedId\.occurrenceDate/);
    expect(code).toMatch(/parsedId\.masterId/);
  });

  it('branches on the parsed occurrence, not a substring test', () => {
    // `id.includes(':')` asks the wrong question — whether the string has a
    // colon, rather than whether it named an occurrence that parses.
    expect(code).not.toMatch(/editScope === 'this' && .*id\.includes\(':'\)/);
  });
});
