import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { tasks } from '@/db/schema';
import { eq } from 'drizzle-orm';

function normalizeTimeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizeRemainingFocusTime(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function normalizeTaskStatusForDb(status: unknown): 'todo' | 'doing' | 'done' {
  if (status === 'doing' || status === 'done') return status;
  return 'todo';
}

/** GET /api/tasks — return all tasks for the authenticated user */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  void req;

  try {
    const db = getDatabase();
    const rows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .orderBy(tasks.createdAt);

    // Map DB rows to the client-side Task shape
    const mapped = rows.map((row, index) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status as 'todo' | 'doing' | 'done',
      dbStatus: row.status,
      priority: row.priority as 'low' | 'medium' | 'high',
      difficulty: (row.difficulty ?? 'medium') as 'easy' | 'medium' | 'hard',
      dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
      durationMinutes: row.estimatedMinutes,
      scheduledStart: row.scheduledStart ?? null,
      scheduledEnd: row.scheduledEnd ?? null,
      remainingFocusTime: row.remainingFocusTime ?? null,
      order: index,
      context: null,
      linkedEventId: row.linkedEventId ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));

    return NextResponse.json(mapped);
  } catch (err) {
    console.error('[GET /api/tasks]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/tasks — create a new task for the authenticated user */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { title, description, status, priority, difficulty, dueDate, durationMinutes, scheduledStart, scheduledEnd, remainingFocusTime, linkedEventId } = body as {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    difficulty?: string;
    dueDate?: string | null;
    durationMinutes?: number;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    remainingFocusTime?: number | null;
    linkedEventId?: string | null;
  };

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const validPriorities = ['low', 'medium', 'high'];
  const validDifficulties = ['easy', 'medium', 'hard'];

  try {
    const db = getDatabase();
    const [row] = await db
      .insert(tasks)
      .values({
        userId,
        title: title.trim(),
        description: description ?? null,
        status: normalizeTaskStatusForDb(status),
        priority: (validPriorities.includes(priority ?? '') ? priority : 'medium') as 'low' | 'medium' | 'high',
        difficulty: (validDifficulties.includes(difficulty ?? '') ? difficulty : 'medium') as 'easy' | 'medium' | 'hard',
        dueDate: dueDate ? new Date(dueDate) : null,
        estimatedMinutes: typeof durationMinutes === 'number' ? durationMinutes : 30,
        scheduledStart: normalizeTimeString(scheduledStart),
        scheduledEnd: normalizeTimeString(scheduledEnd),
        remainingFocusTime: normalizeRemainingFocusTime(remainingFocusTime),
        linkedEventId: typeof linkedEventId === 'string' && linkedEventId.trim() ? linkedEventId : null,
      })
      .returning({ id: tasks.id });

    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/tasks]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
