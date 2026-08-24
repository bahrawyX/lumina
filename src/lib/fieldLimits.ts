import { NextResponse } from 'next/server';

/**
 * Length caps for the text columns clients write to.
 *
 * P3-2: nothing bounded these. Confirmed by the audit against production:
 * `POST /api/tasks` with a 100,000-character title returned **500**, because
 * the value went straight into `varchar(512)` and Postgres raised
 * `value too long for type character varying(512)` (22001). A 500 is the wrong
 * answer to a request the client got wrong, and it buries a real error in the
 * logs behind an entirely predictable one.
 *
 * The numbers mirror the schema exactly. `text` columns have no storage limit,
 * so the caps on those are product judgements about what a description is —
 * generous enough that no real user hits them, small enough that the column is
 * not a free blob store.
 */
export const FIELD_LIMITS = {
  /** `tasks.title`, `docs.title`, `events.title` — all varchar(512). */
  title: 512,
  /** `goals.title`, `goal_targets.title`, `calendars.name` — varchar(255). */
  shortTitle: 255,
  /** `text` columns: a description, not a document. */
  description: 10_000,
  /** `events.location`. */
  location: 500,
} as const;

/**
 * True when `value` is a string longer than `max`.
 *
 * Counts UTF-16 code units, the same unit `varchar(n)` does NOT count —
 * Postgres counts characters. `.length` over-counts astral characters (an emoji
 * is 2), so this rejects slightly earlier than the column would. That is the
 * safe direction: it can never let through a value the database will reject.
 */
export function exceedsLength(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.length > max;
}

/** 400 for a field the client sent too long — never a 500 from the driver. */
export function tooLongResponse(field: string, max: number): NextResponse {
  return NextResponse.json(
    { error: `${field} must be at most ${max} characters` },
    { status: 400 },
  );
}

/**
 * Check several fields at once. Returns the response to send, or null to
 * continue.
 *
 *     const tooLong = checkLengths({ title, description: FIELD_LIMITS.description });
 */
export function checkFieldLengths(
  fields: Record<string, { value: unknown; max: number }>,
): NextResponse | null {
  for (const [name, { value, max }] of Object.entries(fields)) {
    if (exceedsLength(value, max)) return tooLongResponse(name, max);
  }
  return null;
}
