/**
 * linkPersistence.ts
 * Thin client-side wrappers around /api/link for atomic task↔event linking.
 */

import type { CalendarEvent } from '@/types';
import type { Task } from '@/types/task';
import { uid } from '@/lib/uid';
import { apiFetch } from './apiClient';
import { GUEST_COLLECTIONS, isGuestUser, readGuest, writeGuest } from './guestStorage';

/**
 * F6.1: tasks and events are both kept in the guest namespace, so a guest can
 * create either — and then every attempt to CONNECT them hit `/api/link`,
 * 401'd, and returned false. "Schedule this task" is one of the main things
 * the product does, and for a guest it silently did nothing.
 *
 * The server does this in a transaction across two tables. Locally it is two
 * field writes, so the guest path mirrors the invariant rather than the
 * mechanism: a task points at one event and that event points back.
 */
function readGuestTasks(): Task[] {
  return readGuest<Task[]>(GUEST_COLLECTIONS.tasks, []);
}
function readGuestEvents(): CalendarEvent[] {
  return readGuest<CalendarEvent[]>(GUEST_COLLECTIONS.events, []);
}

/** Write both sides of the link, or neither. */
function setGuestLink(taskId: string, eventId: string | null): boolean {
  const tasks = readGuestTasks();
  const taskIdx = tasks.findIndex((t) => t.id === taskId);
  if (taskIdx < 0) return false;

  const events = readGuestEvents();
  if (eventId !== null && !events.some((e) => e.id === eventId)) return false;

  const previousEventId = tasks[taskIdx].linkedEventId ?? null;
  tasks[taskIdx] = { ...tasks[taskIdx], linkedEventId: eventId };

  const next = events.map((e) => {
    // Clear the old partner so a task cannot leave a dangling back-reference,
    // which is what `events_linked_task_uniq` enforces server-side (P2-5).
    if (previousEventId && e.id === previousEventId) return { ...e, linkedTaskId: null };
    if (eventId && e.id === eventId) return { ...e, linkedTaskId: taskId };
    return e;
  });

  writeGuest(GUEST_COLLECTIONS.tasks, tasks);
  writeGuest(GUEST_COLLECTIONS.events, next);
  return true;
}

/** Atomically link a task and event in a single DB transaction. */
export async function linkTaskEvent(taskId: string, eventId: string): Promise<boolean> {
  if (isGuestUser()) return setGuestLink(taskId, eventId);
  try {
    const res = await apiFetch('/api/link', {
      method: 'POST',
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
  if (isGuestUser()) {
    const eventId = uid();
    const event = {
      id: eventId,
      title: payload.title,
      description: payload.description ?? '',
      date: payload.date,
      startTime: payload.startTime ?? '09:00',
      endTime: payload.endTime ?? '10:00',
      timezone: payload.timezone ?? 'UTC',
      location: payload.location,
      category: (payload.category ?? 'work') as CalendarEvent['category'],
      color: payload.color ?? '#6366f1',
      isAllDay: payload.isAllDay ?? false,
      source: 'lumina',
      linkedTaskId: payload.taskId,
    } as unknown as CalendarEvent;

    writeGuest(GUEST_COLLECTIONS.events, [...readGuestEvents(), event]);
    if (!setGuestLink(payload.taskId, eventId)) return null;

    // No recurrence locally: the guest event is a single occurrence. Expansion
    // is a server concern and importing a half-expanded series on sign-up
    // would be worse than importing one dated event.
    return {
      eventId,
      recurrenceId: null,
      taskId: payload.taskId,
      linkedAt: new Date().toISOString(),
    };
  }
  try {
    const res = await apiFetch('/api/events/create-linked', {
      method: 'POST',
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
  if (isGuestUser()) {
    // `eventId` is checked so unlinking a stale pair cannot silently clear a
    // link the user has since re-pointed elsewhere.
    const task = readGuestTasks().find((t) => t.id === taskId);
    if (!task || task.linkedEventId !== eventId) return false;
    return setGuestLink(taskId, null);
  }
  try {
    const res = await apiFetch('/api/link', {
      method: 'DELETE',
      body: JSON.stringify({ taskId, eventId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
