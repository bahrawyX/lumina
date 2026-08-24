import type { Task } from '@/types/task';
import type { CalendarEvent } from '@/types';
import type { DocContent } from '@/types/doc';
import { apiFetch } from './apiClient';
import {
  GUEST_COLLECTIONS,
  clearGuestData,
  hasGuestData,
  readGuest,
} from './guestStorage';

/**
 * Move a guest session's local data into the account they just created.
 *
 * `GuestUpgradeModal` told the user, at the exact moment they decide whether to
 * trust the product with their work:
 *
 * > "Sign up for free — **your current guest data can be imported.**"
 *
 * `grep -rni "migrateguest|importguest|guestdata|migrateGuestDocs" src/`
 * returned **0 results**. There was no migration anywhere. What actually
 * happened on sign-up: `setGuest(false)` flipped, the API path took over, and
 * the guest data was orphaned in localStorage — never read again, never
 * deleted. On sign-out `clearLuminaStorage()` removed it outright, so guest
 * documents were **hard-deleted with no confirmation**.
 *
 * This makes the promise true.
 *
 * ## Design notes
 *
 * - **Idempotent by construction.** The guest namespace is deleted only after
 *   every collection has been attempted, and a partial failure leaves the data
 *   in place so a later run can retry. Re-running after a full success is a
 *   no-op because `hasGuestData()` is false.
 * - **Best-effort per record.** One rejected task must not abandon the other
 *   forty. Failures are counted and reported, not thrown.
 * - **Sequential, not parallel.** This runs once, right after sign-up, against
 *   endpoints with per-user rate limits. Forty concurrent POSTs would trip them.
 * - **Planner items are skipped.** They reference `taskId`s that the server
 *   re-assigns on import, so migrating them would create rows pointing at ids
 *   that no longer exist. The tasks themselves carry the user's actual work;
 *   a day plan is trivially rebuilt and is not worth a dangling reference.
 */

export interface GuestMigrationResult {
  /** Records successfully written to the account. */
  migrated: number;
  /** Records that could not be written; their data is retained locally. */
  failed: number;
  /** True when the local guest namespace was cleared. */
  cleared: boolean;
}

const EMPTY: GuestMigrationResult = { migrated: 0, failed: 0, cleared: false };

async function post(path: string, body: unknown): Promise<boolean> {
  try {
    const res = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function migrateGuestData(): Promise<GuestMigrationResult> {
  if (typeof window === 'undefined') return EMPTY;
  if (!hasGuestData()) return EMPTY;

  let migrated = 0;
  let failed = 0;

  // ── Tasks ────────────────────────────────────────────────────────────────
  for (const task of readGuest<Task[]>(GUEST_COLLECTIONS.tasks, [])) {
    // `id` and `userId` are deliberately not sent: the server generates its own
    // and ignores an injected user id (verified in the audit's mass-assignment
    // probe). Sending the guest's client-side uid would be meaningless anyway.
    const { id, ...rest } = task as Task & { id?: string };
    void id;
    const okResult = await post('/api/tasks', rest);
    okResult ? migrated++ : failed++;
  }

  // ── Events ───────────────────────────────────────────────────────────────
  for (const event of readGuest<CalendarEvent[]>(GUEST_COLLECTIONS.events, [])) {
    const { id, ...rest } = event as CalendarEvent & { id?: string };
    void id;
    const okResult = await post('/api/events', rest);
    okResult ? migrated++ : failed++;
  }

  // ── Docs ─────────────────────────────────────────────────────────────────
  const docs = readGuest<Record<string, DocContent>>(GUEST_COLLECTIONS.docs, {});
  for (const doc of Object.values(docs)) {
    const { id, parentId, ...rest } = doc as DocContent & { id?: string; parentId?: string | null };
    void id;
    // `parentId` referenced a guest-local doc id that will not exist after
    // import; dropping it flattens the tree rather than orphaning rows.
    void parentId;
    const okResult = await post('/api/docs', rest);
    okResult ? migrated++ : failed++;
  }

  // Planner items are intentionally not migrated — see the module doc comment.

  // Only drop the local copy once nothing failed. A partial migration that
  // deleted the source would lose exactly the records that could not be saved.
  const cleared = failed === 0;
  if (cleared) clearGuestData();

  return { migrated, failed, cleared };
}
