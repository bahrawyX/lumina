import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTaskBoardStore } from '@/store/useTaskBoardStore';
import { useDocsStore } from '@/store/useDocsStore';
import { useCalendarEventsStore } from '@/store/useCalendarEventsStore';
import { useCalendarStore } from '@/store/useCalendarStore';
import { useQuickCaptureStore } from '@/store/useQuickCaptureStore';
import { CATEGORIES } from '@/constants';
import type { CalendarEvent, EventCategory } from '@/types';
import { uid } from '@/lib/uid';

/**
 * Quick Capture actions. Each create* helper routes through the existing
 * store action so we don't duplicate persistence — addTask / createDoc /
 * addEvent already POST to the API and update the store optimistically.
 *
 * The hook only handles the tiny extra UX wrapping (close the modal, toast
 * the result, navigate to the new doc).
 */
export function useQuickCaptureActions() {
  const router = useRouter();
  const close = useQuickCaptureStore((s) => s.close);

  const createTask = useCallback(
    (title: string, dueDate: Date | null, goalId?: string | null) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      close();
      const dueIso = dueDate ? dueDate.toISOString().slice(0, 10) : null;
      const task = useTaskBoardStore.getState().addTask({
        title: trimmed,
        status: 'todo',
        dueDate: dueIso,
        ...(goalId ? { goalId } : {}),
      });
      if (!task) {
        toast.error("Couldn't create task");
        return;
      }
      toast.success(`Task created: "${trimmed}"`, {
        action: {
          label: 'View',
          onClick: () => {
            window.dispatchEvent(
              new CustomEvent('lumina:open-task', { detail: { taskId: task.id } }),
            );
          },
        },
      });
    },
    [close],
  );

  const createDoc = useCallback(
    async (title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      close();
      const docId = await useDocsStore.getState().createDoc({ title: trimmed });
      if (!docId) {
        // useDocsStore.createDoc already shows its own error toast on
        // failure, so don't double-toast here.
        return;
      }
      router.push(`/docs/${docId}`);
    },
    [close, router],
  );

  const createEvent = useCallback(
    (title: string, date: Date, durationMinutes: number) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      close();

      // Build the CalendarEvent object the store expects. Defaults match
      // the EventModal's "create from scratch" path.
      const start = new Date(date);
      const end = new Date(start.getTime() + durationMinutes * 60_000);

      const pad = (n: number) => String(n).padStart(2, '0');
      const yyyy = start.getFullYear();
      const mm = pad(start.getMonth() + 1);
      const dd = pad(start.getDate());
      const startTime = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
      const endTime = `${pad(end.getHours())}:${pad(end.getMinutes())}`;

      const defaultCategory: EventCategory =
        (CATEGORIES.find((c) => c.name === 'Personal')?.name as EventCategory) ?? 'Personal';
      const defaultColor =
        CATEGORIES.find((c) => c.name === defaultCategory)?.color ?? 'hsl(var(--primary))';
      const tz = useCalendarStore.getState().timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

      const event: CalendarEvent = {
        id: uid('ev_'),
        title: trimmed,
        description: '',
        date: `${yyyy}-${mm}-${dd}`,
        startTime,
        endTime,
        timezone: tz,
        category: defaultCategory,
        color: defaultColor,
      };

      useCalendarEventsStore.getState().addEvent(event);
      toast.success(`Event added: "${trimmed}"`);
    },
    [close],
  );

  return { createTask, createDoc, createEvent };
}
