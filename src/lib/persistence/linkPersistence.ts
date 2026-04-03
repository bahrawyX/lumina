/**
 * linkPersistence.ts
 * Thin client-side wrappers around /api/link for atomic task↔event linking.
 */

function apiBase() {
  if (typeof window !== 'undefined') return '';
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

/** Atomically link a task and event in a single DB transaction. */
export async function linkTaskEvent(taskId: string, eventId: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/api/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, eventId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Atomically create a calendar event AND link it to a task in one DB transaction.
 * Returns { eventId, recurrenceId, taskId, linkedAt } on success, or null on failure.
 */
export async function createLinkedEvent(
  payload: {
    title: string;
    date: string;
    startTime?: string;
    endTime?: string;
    description?: string;
    location?: string;
    isAllDay?: boolean;
    category?: string;
    color?: string;
    timezone?: string;
    recurrence?: { rrule: string; exdates?: string[]; until?: string };
    taskId: string;
  },
): Promise<{ eventId: string; recurrenceId: string | null; taskId: string; linkedAt: string } | null> {
  try {
    const res = await fetch(`${apiBase()}/api/events/create-linked`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Atomically unlink a task and event in a single DB transaction. */
export async function unlinkTaskEvent(taskId: string, eventId: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/api/link`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, eventId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
