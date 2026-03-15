export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  description?: string;
  context?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  order: number;
  createdAt: string;
  updatedAt: string;
  dueDate?: string | null;
  linkedEventId?: string | null;
  /** Estimated work duration in minutes. Defaults to 30 when not set. */
  durationMinutes?: number;
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
