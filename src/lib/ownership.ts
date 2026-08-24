import 'server-only';

import { and, eq } from 'drizzle-orm';
import { docs, events, goals, tasks } from '@/db/schema';

/**
 * "Does this row belong to the caller?" — for every linked foreign key.
 *
 * ## What was wrong
 *
 * `POST /api/tasks` validated every linked FK against the caller, with a
 * comment explaining exactly why:
 *
 *     // Batch 5 (FK ownership on create): linked FKs must belong to the caller.
 *     // A foreign goalId in particular would otherwise be counted into that other
 *     // user's goal-progress aggregation.
 *
 * The `PATCH` handler for the same resource did this instead:
 *
 *     if (body.goalId === null) patch.goalId = null;
 *     else if (typeof body.goalId === 'string' && body.goalId.trim()) {
 *       patch.goalId = body.goalId;            // <- no ownership check
 *     }
 *
 * So the exact scenario the POST guard was written to prevent was reachable via
 * `PATCH /api/tasks/{myTaskId} {"goalId": "<victim-goal-uuid>"}`. The same gap
 * existed for `linkedEventId` on tasks, for `parentId` / `linkedTaskId` /
 * `linkedEventId` on docs, and for `linkedDocId` on events — where the adjacent
 * `linkedTaskId` *is* correctly checked, two lines above.
 *
 * ## Impact
 *
 * Bounded but real. The read-side aggregations are defensively re-scoped by
 * `userId`, so goal progress could not actually be inflated — that
 * defence-in-depth was doing its job. But the cross-tenant row was still
 * written, `syncTaskCompletionTargets` then ran against it, **a successful
 * write confirmed a foreign UUID exists**, and `docs.parentId` could be set to a
 * descendant of itself, producing a cycle that makes any recursive tree walk
 * loop forever.
 *
 * Extracting it here means the two handlers cannot drift again.
 */

const TABLES = { tasks, events, docs, goals } as const;
export type OwnedTable = keyof typeof TABLES;

type Db = {
  select: (fields: Record<string, unknown>) => {
    from: (table: unknown) => {
      where: (cond: unknown) => { limit: (n: number) => Promise<Array<{ id: string }>> };
    };
  };
};

/** True if `rowId` exists in `table` AND belongs to `userId`. */
export async function ownsRow(
  db: unknown,
  table: OwnedTable,
  rowId: string,
  userId: string,
): Promise<boolean> {
  const t = TABLES[table];
  const rows = await (db as Db)
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.id, rowId), eq(t.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export interface OwnershipFailure {
  field: string;
  table: OwnedTable;
}

/**
 * Validate every supplied linked FK in one pass.
 *
 * `undefined` values are skipped (the field was not in the patch) and `null`
 * values are skipped (the caller is clearing the link, which needs no
 * ownership). Only a non-empty string is checked.
 *
 * Returns the first failure, or `null` when everything checks out.
 */
export async function checkLinkedOwnership(
  db: unknown,
  userId: string,
  links: Partial<Record<string, { value: unknown; table: OwnedTable }>>,
): Promise<OwnershipFailure | null> {
  for (const [field, spec] of Object.entries(links)) {
    if (!spec) continue;
    const { value, table } = spec;
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;

    if (!(await ownsRow(db, table, trimmed, userId))) {
      return { field, table };
    }
  }
  return null;
}

/**
 * Walk a doc's ancestors to confirm `candidateParentId` is not the doc itself
 * or one of its descendants.
 *
 * Without this, `docs.parentId` could be set to a descendant, producing a
 * **cycle**: any recursive tree walk over the docs sidebar then loops forever.
 * The walk is bounded so a cycle that already exists in the data cannot hang
 * this check too.
 */
export async function wouldCreateDocCycle(
  db: unknown,
  userId: string,
  docId: string,
  candidateParentId: string,
  maxDepth = 64,
): Promise<boolean> {
  if (docId === candidateParentId) return true;

  let cursor: string | null = candidateParentId;
  const seen = new Set<string>();

  for (let depth = 0; depth < maxDepth && cursor; depth++) {
    if (cursor === docId) return true;
    if (seen.has(cursor)) return true; // pre-existing cycle
    seen.add(cursor);

    const rows: Array<{ parentId: string | null }> = await (db as unknown as {
      select: (f: Record<string, unknown>) => {
        from: (t: unknown) => {
          where: (c: unknown) => { limit: (n: number) => Promise<Array<{ parentId: string | null }>> };
        };
      };
    })
      .select({ parentId: docs.parentId })
      .from(docs)
      .where(and(eq(docs.id, cursor), eq(docs.userId, userId)))
      .limit(1);

    cursor = rows[0]?.parentId ?? null;
  }

  // Ran out of depth without reaching the root: treat as a cycle rather than
  // allowing a link we could not prove safe.
  return Boolean(cursor);
}
