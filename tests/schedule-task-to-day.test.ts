/**
 * P3-9 — ~105 lines of auto-scheduling business logic lived inside
 * `TaskBoard.handleAutoSchedule`, a `useCallback` with an eight-entry
 * dependency array, while `src/utils/scheduling/` already held five pure
 * modules for exactly this.
 *
 * It matters more than an ordinary "long function" complaint: this is the code
 * that decides whether a task gets a NEW event or reuses its linked one — the
 * task↔event linking path where the store-drift bugs in P1-17 and the
 * orphan-event race in P2-5 both surface. Trapped in a component it could only
 * be exercised by driving the UI.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scheduleTaskToDay, type ScheduleTaskToDayInput } from '@/lib/tasks/scheduleTaskToDay';
import type { Task } from '@/types/task';
import type { CalendarEvent } from '@/types';

const TODAY = '2026-08-25';

const task = (over: Partial<Task> = {}): Task =>
  ({
    id: 'task-1',
    title: 'Write the thing',
    description: 'details',
    status: 'todo',
    priority: 'medium',
    difficulty: 'medium',
    durationMinutes: 60,
    order: 0,
    dueDate: null,
    linkedEventId: null,
    parentTaskId: null,
    depth: 0,
    goalId: null,
    ...over,
  }) as Task;

const input = (over: Partial<ScheduleTaskToDayInput> = {}): ScheduleTaskToDayInput => ({
  task: task(),
  today: TODAY,
  nowMins: 9 * 60,
  calendarItems: [],
  planItems: [],
  alreadyPlanned: false,
  linkedEvent: null,
  timezone: 'Europe/Berlin',
  newEventId: 'ev_new',
  ...over,
});

describe('P3-9 — scheduleTaskToDay is pure and decides everything at once', () => {
  it('refuses a task that is already on the day', () => {
    expect(scheduleTaskToDay(input({ alreadyPlanned: true }))).toEqual({ kind: 'already_planned' });
  });

  it('finds a slot on an empty day', () => {
    const result = scheduleTaskToDay(input());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.startTime).toMatch(/^\d{2}:\d{2}$/);
    expect(result.plan).toEqual({
      taskId: 'task-1',
      date: TODAY,
      startTime: result.startTime,
      endTime: result.endTime,
    });
  });

  it('reports why it could not schedule, with the duration needed', () => {
    // A task longer than the whole timeline window.
    const result = scheduleTaskToDay(input({ task: task({ durationMinutes: 24 * 60 }) }));
    expect(result).toMatchObject({ kind: 'no_slot', reason: 'task_too_long', durationMins: 1440 });
  });

  it('reports no_free_time separately from too_long', () => {
    // The timeline window is 00:00–24:00, so covering it exactly is what
    // leaves zero free slots. `23:59` leaves a one-minute sliver, which the
    // engine reports as `task_too_long` instead — the two reasons are
    // genuinely distinct and the caller shows a different message for each.
    const full = scheduleTaskToDay(
      input({ calendarItems: [{ id: 'e1', startTime: '00:00', endTime: '24:00' }] }),
    );
    expect(full).toMatchObject({ kind: 'no_slot', reason: 'no_free_time' });

    const sliver = scheduleTaskToDay(
      input({ calendarItems: [{ id: 'e1', startTime: '00:00', endTime: '23:59' }] }),
    );
    expect(sliver).toMatchObject({ kind: 'no_slot', reason: 'task_too_long' });
  });

  it('avoids an occupied slot', () => {
    const result = scheduleTaskToDay(
      input({
        nowMins: 0,
        calendarItems: [{ id: 'e1', startTime: '09:00', endTime: '11:00' }],
      }),
    );
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    // The chosen slot must not overlap 09:00–11:00.
    const overlaps = result.startTime < '11:00' && result.endTime > '09:00';
    expect(overlaps).toBe(false);
  });

  it('treats plan items as occupied too, not just calendar events', () => {
    const busy = scheduleTaskToDay(
      input({ nowMins: 0, planItems: [{ id: 'p1', startTime: '09:00', endTime: '11:00' }] }),
    );
    expect(busy.kind).toBe('ok');
    if (busy.kind !== 'ok') return;
    expect(busy.startTime < '11:00' && busy.endTime > '09:00').toBe(false);
  });
});

describe('P3-9 — the task↔event linking decision', () => {
  const linked = {
    id: 'ev_existing',
    title: 'Old title',
    date: '2026-01-01',
    startTime: '08:00',
    endTime: '09:00',
    category: 'Work',
    source: 'lumina',
  } as unknown as CalendarEvent;

  it('REUSES the linked event rather than creating a second one', () => {
    // Creating a new event for a task that already has one is exactly the
    // orphan P2-5 describes, from the other direction.
    const result = scheduleTaskToDay(
      input({ task: task({ linkedEventId: 'ev_existing' }), linkedEvent: linked }),
    );
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.event.mode).toBe('update');
    expect(result.event.value.id).toBe('ev_existing');
    expect(result.taskPatch.linkedEventId).toBe('ev_existing');
  });

  it('carries the new time and title onto the reused event', () => {
    const result = scheduleTaskToDay(
      input({ task: task({ linkedEventId: 'ev_existing' }), linkedEvent: linked }),
    );
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.event.value.title).toBe('Write the thing');
    expect(result.event.value.date).toBe(TODAY);
    expect(result.event.value.startTime).toBe(result.startTime);
    expect(result.event.value.linkedTaskId).toBe('task-1');
  });

  it('creates one with the supplied id when there is no link', () => {
    const result = scheduleTaskToDay(input());
    if (result.kind !== 'ok') throw new Error('expected ok');
    expect(result.event.mode).toBe('create');
    expect(result.event.value.id).toBe('ev_new');
    expect(result.taskPatch.linkedEventId).toBe('ev_new');
  });

  it('stamps the timezone on a NEW event only', () => {
    const created = scheduleTaskToDay(input());
    if (created.kind !== 'ok') throw new Error('expected ok');
    expect(created.event.value.timezone).toBe('Europe/Berlin');
  });

  it('moves a todo to doing, and never un-completes anything', () => {
    for (const [from, to] of [
      ['todo', 'doing'],
      ['doing', 'doing'],
      ['done', 'done'],
    ] as const) {
      const result = scheduleTaskToDay(input({ task: task({ status: from }) }));
      if (result.kind !== 'ok') throw new Error('expected ok');
      expect(result.taskPatch.status, from).toBe(to);
    }
  });

  it('is pure — the same input twice gives the same answer', () => {
    // No `Date.now()`, no id generation, no store reads.
    expect(scheduleTaskToDay(input())).toEqual(scheduleTaskToDay(input()));
  });
});

describe('P3-9 — the component only gathers inputs and applies the result', () => {
  const board = readFileSync(
    join(process.cwd(), 'src', 'components', 'tasks', 'TaskBoard.tsx'),
    'utf8',
  );

  it('delegates the decision', () => {
    expect(board).toContain('scheduleTaskToDay({');
    expect(board).not.toContain('DEFAULT_DURATION_MINS');
    expect(board).not.toContain('TIMELINE_START_HOUR');
  });

  it('still creates the event and its link in one transaction', () => {
    // P2-5: a separate create-then-link would reopen the orphan race.
    expect(board).toContain('createLinkedEvent({');
  });
});

describe('P3-9 — the other defects in the same finding', () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

  it('the pomodoro celebration timeout is cleaned up', () => {
    // Navigating away during the 2.5s celebration fired callbacks against an
    // unmounted tree AND left `completionHandledRef` stuck true, so a remount
    // inside the window could double-record the session.
    const view = read('components', 'focus', 'PomodoroView.tsx');
    expect(view).toContain('celebrationTimerRef');
    expect(view).toContain('clearTimeout(celebrationTimerRef.current)');
    expect(view).toContain('blurTimerRef');
  });

  it('the quick switcher aborts in-flight searches', () => {
    // Debounced but not aborted: a slow response for "pro" could land after the
    // one for "project" and overwrite it.
    const qs = read('components', 'docs', 'QuickSwitcher.tsx');
    expect(qs).toContain('searchAbort.current?.abort()');
    expect(qs).toContain('signal: controller.signal');
    expect(qs).toContain('focusTimer');
  });

  it('lazy dialogs show a pending state instead of nothing', () => {
    // `fallback={null}` made a click on "New goal" look like a dead click on a
    // slow connection.
    for (const parts of [
      ['components', 'pages', 'GoalsPage.tsx'],
      ['components', 'tasks', 'TaskBoard.tsx'],
      ['app', '(app)', 'AppShell.tsx'],
    ]) {
      expect(read(...parts), parts.join('/')).toContain('LazyDialogFallback');
    }
  });

  it('the fallback waits before showing, and announces itself', () => {
    const fb = read('components', 'ui', 'LazyDialogFallback.tsx');
    // A cached chunk resolves in a few ms; flashing a spinner for one frame is
    // worse than showing nothing.
    expect(fb).toContain('setTimeout(() => setVisible(true), 150)');
    expect(fb).toContain('role="status"');
  });

  it('the connected-integration flag is no longer persisted in two places', () => {
    // Disconnecting Google left `useOnboardingStore.googleConnected === true`
    // in localStorage, so the stale badge survived every reload.
    const store = read('store', 'useOnboardingStore.ts');
    expect(store).toContain('partialize:');
    expect(store).not.toMatch(/partialize[\s\S]{0,900}googleConnected: state\.googleConnected/);

    const sidebar = read('components', 'Sidebar.tsx');
    expect(sidebar).toContain('syncOnboardingIntegrationFlags(');
  });
});
