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
