export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskDifficulty = 'easy' | 'medium' | 'hard';

export interface Task {
  id: string;
  title: string;
  description?: string;
  context?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  difficulty: TaskDifficulty;
  order: number;
  createdAt: string;
  updatedAt: string;
  dueDate?: string | null;
  linkedEventId?: string | null;
  /**
   * RRULE for a repeating task, e.g. `FREQ=WEEKLY;BYDAY=TU`.
   *
   * Next-occurrence, not expansion: a recurring task exists once, and
   * completing it spawns the next. See `src/lib/tasks/recurrence.ts`.
   */
  recurrenceRule?: string | null;
  /** Stop repeating after this instant. Null = indefinitely. */
  recurrenceEnd?: string | null;
  /** The first task in the series; null for one-offs and for the original. */
  recurrenceParentId?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  remainingFocusTime?: number | null;
  /** Estimated work duration in minutes. Defaults to 30 when not set. */
  durationMinutes?: number;
  /** Parent task ID for subtask hierarchy. null = root task. */
  parentTaskId?: string | null;
  /** Nesting depth: 0 = root, 1 = subtask, 2 = sub-subtask. */
  depth?: number;
  /** Optional FK to the parent goal — links the task into the Goal-Driven Work loop. */
  goalId?: string | null;
}

export interface Column {
  id: TaskStatus;
  label: string;
}

export const COLUMNS: Column[] = [
  { id: 'todo',  label: 'To Do'  },
  { id: 'doing', label: 'Doing'  },
  { id: 'done',  label: 'Done'   },
];
