import 'server-only';
import { NextResponse } from 'next/server';
import type { z } from 'zod';

/**
 * Parse and validate a JSON request body against a schema.
 *
 * ## What this replaces
 *
 * Most routes hand-rolled their checks:
 *
 *     if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim();
 *     if (typeof body.durationMinutes === 'number') patch.estimatedMinutes = body.durationMinutes;
 *
 * That shape is safe against type confusion — a bad value is skipped rather
 * than written — but it is silent about it, and silence is where the bugs
 * live. `durationMinutes: -5` and `durationMinutes: 1e9` both pass, because
 * "is a number" was the whole test. The client is told the request succeeded
 * and never learns which field it got wrong.
 *
 * It also drifts. `POST /api/goals` rejected an end date before the start date
 * and `PATCH /api/goals/[id]` did not, because the rule lived in one handler
 * rather than in a shape both shared.
 *
 * ## What a failure looks like
 *
 * A 400 naming the offending fields and why. The paths and messages come from
 * the schema, which the client can act on — unlike a generic
 * "Invalid request body", which leaves someone guessing which of fifteen
 * fields was wrong.
 *
 * Deliberately no raw values in the response: an error string that echoes the
 * submitted body reflects user-controlled content back, which P3-3 spent
 * effort removing from the provider routes.
 */

export type ParsedBody<T> =
  | { ok: true; data: T }
  /** Ready to return. The handler should not add to it. */
  | { ok: false; response: NextResponse };

export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<ParsedBody<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Invalid request body',
          // `path` is the field, `message` is the rule it broke. Neither
          // contains the submitted value.
          details: result.error.issues.slice(0, 10).map((issue) => ({
            field: issue.path.join('.') || '(root)',
            message: issue.message,
          })),
        },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: result.data };
}
