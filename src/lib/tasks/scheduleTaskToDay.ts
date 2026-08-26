import type { CalendarEvent } from '@/types';
import type { Task } from '@/types/task';
import { scheduleTask, DEFAULT_DURATION_MINS } from '@/utils/scheduling/scheduleTask';
import { TIMELINE_START_HOUR, TIMELINE_END_HOUR } from '@/utils/dailyPlanUtils';
import { EVENT_COLORS } from '@/constants';

/**
 * Decide everything that "auto-schedule this task for today" produces.
 *
 * P3-9: this was ~105 lines inside `TaskBoard.handleAutoSchedule`, a
 * `useCallback` with an eight-entry dependency array, mixed in with three store
 * writes and two toasts — while `src/utils/scheduling/` already held five pure
 * modules for exactly this kind of work.
 *
 * It matters more than an ordinary "long function" complaint because this is
 * the code that decides whether a task gets a NEW event or reuses its linked
 * one — the task↔event linking path where the store-drift bugs in P1-17 and the
 * orphan-event race in P2-5 both surface. Trapped in a component it could only
 * be exercised by driving the UI.
 *
 * Pure: no store reads, no `Date.now()`, no id generation, no toasts. The
 * caller supplies today's date, the current minute, the two occupancy lists,
 * the already-linked event if there is one, and an id to use for a new event.
 * It gets back a plan describing what to write.
 */

export interface TimedItem {
  id: string;
  startTime: string;
  endTime: string;
}

export interface ScheduleTaskToDayInput {
  task: Task;
  /** 'YYYY-MM-DD' — the day being scheduled into. */
  today: string;
  /** Minutes from local midnight; slots before this are not offered. */
  nowMins: number;
  /** Today's calendar events, recurrence already expanded. */
  calendarItems: TimedItem[];
  /** Today's existing plan items. */
  planItems: TimedItem[];
  /** True when this task already has a plan item today. */
  alreadyPlanned: boolean;
  /** The task's linked event, if it has one. */
  linkedEvent: CalendarEvent | null;
  /** IANA zone to stamp on a newly created event. */
  timezone: string;
  /** Id to use if a new event must be created. */
  newEventId: string;
}

export type ScheduleTaskToDayResult =
  | { kind: 'already_planned' }
  | { kind: 'no_slot'; reason: 'no_free_time' | 'task_too_long'; durationMins: number }
  | {
      kind: 'ok';
      startTime: string;
      endTime: string;
      /** The plan item to add. */
      plan: { taskId: string; date: string; startTime: string; endTime: string };
      /**
       * `update` reuses the task's existing linked event; `create` needs a new
       * one, which the caller must also persist through `create-linked` so the
       * event and the link commit in one transaction (P2-5).
       */
      event:
        | { mode: 'update'; value: CalendarEvent }
        | { mode: 'create'; value: CalendarEvent };
      /** Fields to patch onto the task. */
      taskPatch: {
        status: Task['status'];
        dueDate: string;
        linkedEventId: string;
        scheduledStart: string;
        scheduledEnd: string;
      };
    };

export function scheduleTaskToDay(input: ScheduleTaskToDayInput): ScheduleTaskToDayResult {
  const { task, today, nowMins, calendarItems, planItems, alreadyPlanned, linkedEvent, timezone, newEventId } = input;

  if (alreadyPlanned) return { kind: 'already_planned' };

  const durationMins = task.durationMinutes ?? DEFAULT_DURATION_MINS;
  const slot = scheduleTask(
    durationMins,
    calendarItems,
    planItems,
    nowMins,
    TIMELINE_START_HOUR * 60,
    TIMELINE_END_HOUR * 60,
  );

  if (!slot.ok) {
    return { kind: 'no_slot', reason: slot.reason, durationMins };
  }

  const shared = {
    title: task.title,
    description: task.description ?? '',
    category: 'Focus',
    color: EVENT_COLORS.Focus,
    date: today,
    startTime: slot.startTime,
    endTime: slot.endTime,
    linkedTaskId: task.id,
    source: 'lumina' as const,
  };

  const event = linkedEvent
    ? ({ mode: 'update', value: { ...linkedEvent, ...shared } } as const)
    : ({ mode: 'create', value: { ...shared, id: newEventId, timezone } as CalendarEvent } as const);

  return {
    kind: 'ok',
    startTime: slot.startTime,
    endTime: slot.endTime,
    plan: { taskId: task.id, date: today, startTime: slot.startTime, endTime: slot.endTime },
    event,
    taskPatch: {
      // Scheduling a task starts it. An already-doing or done task keeps its
      // status — auto-scheduling must not silently un-complete anything.
      status: task.status === 'todo' ? 'doing' : task.status,
      dueDate: today,
      linkedEventId: linkedEvent ? linkedEvent.id : newEventId,
      scheduledStart: slot.startTime,
      scheduledEnd: slot.endTime,
    },
  };
}
