/**
 * Template data hook — fetches the live tasks needed by data-driven
 * Smart Templates (Weekly Review + Daily Journal).
 *
 * GET /api/tasks doesn't accept date filters yet, so we pull the full list
 * and filter client-side. The endpoint scopes by userId already, so this
 * is the same data the kanban board already has — no privacy leak from
 * over-fetching.
 */
import { useCallback } from 'react';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { useTaskBoardStore } from '@/store/useTaskBoardStore';
import type { WeeklyReviewTask, DailyJournalTask } from './templateContent';

export interface WeeklyReviewData {
  weekLabel: string;
  completedTasks: WeeklyReviewTask[];
  overdueTasks: WeeklyReviewTask[];
  upcomingTasks: WeeklyReviewTask[];
}

export interface DailyJournalData {
  date: string;
  todayTasks: DailyJournalTask[];
}

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

async function fetchAllTasksFresh(): Promise<Array<Record<string, unknown>>> {
  // The kanban board's in-memory store has the live state already, but
  // optimistic ids haven't always been swapped to UUIDs yet. Hit the API
  // for canonical data — falls back to the store when the request fails
  // (offline, guest mode, etc).
  try {
    const res = await fetch('/api/tasks', { credentials: 'include' });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json)) return json;
    }
  } catch {
    /* swallow — fall through to store snapshot */
  }
  return useTaskBoardStore.getState().tasks as unknown as Array<Record<string, unknown>>;
}

export function useTemplateData() {
  const fetchWeeklyReviewData = useCallback(async (): Promise<WeeklyReviewData> => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });     // Sunday
    const nextWeekEnd = new Date(weekEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

    const all = await fetchAllTasksFresh();

    const completed: WeeklyReviewTask[] = [];
    const overdue: WeeklyReviewTask[] = [];
    const upcoming: WeeklyReviewTask[] = [];

    for (const t of all) {
      const id = String(t.id ?? '');
      const title = String(t.title ?? '').trim();
      if (!id || !title) continue;
      // Skip optimistic-id tasks that never got swapped — they shouldn't
      // surface in a review since they're effectively local-only.
      if (!isUuid(id)) continue;

      const status = String(t.status ?? '');
      const dueDateStr = typeof t.dueDate === 'string' ? t.dueDate : '';
      const updatedAtStr = typeof t.updatedAt === 'string' ? t.updatedAt : '';

      if (status === 'done' && updatedAtStr) {
        const u = new Date(updatedAtStr);
        if (!Number.isNaN(u.getTime()) && u >= weekStart && u <= weekEnd) {
          completed.push({ id, title, updatedAt: updatedAtStr });
        }
        continue;
      }

      if ((status === 'todo' || status === 'doing') && dueDateStr) {
        const d = new Date(dueDateStr);
        if (Number.isNaN(d.getTime())) continue;
        if (d < now) {
          overdue.push({ id, title, dueDate: dueDateStr });
        } else if (d <= nextWeekEnd) {
          upcoming.push({ id, title, dueDate: dueDateStr });
        }
      }
    }

    return {
      weekLabel: `Week of ${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`,
      completedTasks: completed,
      overdueTasks: overdue,
      upcomingTasks: upcoming,
    };
  }, []);

  const fetchDailyJournalData = useCallback(async (): Promise<DailyJournalData> => {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');

    const all = await fetchAllTasksFresh();
    const todayTasks: DailyJournalTask[] = [];

    for (const t of all) {
      const id = String(t.id ?? '');
      const title = String(t.title ?? '').trim();
      if (!id || !title) continue;
      if (!isUuid(id)) continue;

      const status = String(t.status ?? 'todo');
      const dueDate = typeof t.dueDate === 'string' ? t.dueDate : '';
      const scheduledStart = typeof t.scheduledStart === 'string' ? t.scheduledStart : '';

      const isDueToday = dueDate.startsWith(todayStr);
      const isScheduledToday = scheduledStart.startsWith(todayStr);
      if (isDueToday || isScheduledToday) {
        todayTasks.push({ id, title, status });
      }
    }

    return {
      date: format(today, 'EEEE, MMMM d, yyyy'),
      todayTasks,
    };
  }, []);

  return { fetchWeeklyReviewData, fetchDailyJournalData };
}
