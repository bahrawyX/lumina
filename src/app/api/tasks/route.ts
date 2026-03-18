import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { tasks } from '@/db/schema';
import { and, eq, ne } from 'drizzle-orm';

function normalizeTaskStatusForDb(status: unknown): 'todo' | 'in_progress' | 'done' | 'archived' {
  if (status === 'doing') return 'in_progress';
  if (status === 'in_progress' || status === 'done' || status === 'archived') return status;
  return 'todo';
}

function mapStatusForUi(status: 'todo' | 'in_progress' | 'done' | 'archived'): 'todo' | 'doing' | 'done' | 'archived' {
  if (status === 'in_progress') return 'doing';
  return status;
}

/** GET /api/tasks — return all tasks for the authenticated user */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const includeArchived = (() => {
    const raw = new URL(req.url).searchParams.get('includeArchived');
    return raw === '1' || raw === 'true';
  })();

  try {
    const db = getDatabase();
    const rows = await db
      .select()
      .from(tasks)
      .where(
        includeArchived
          ? eq(tasks.userId, userId)
          : and(eq(tasks.userId, userId), ne(tasks.status, 'archived'))
      )
      .orderBy(tasks.createdAt);

    // Map DB rows to the client-side Task shape
    const mapped = rows.map((row, index) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      status: mapStatusForUi(row.status as 'todo' | 'in_progress' | 'done' | 'archived'),
      dbStatus: row.status,
      priority: row.priority as 'low' | 'medium' | 'high',
      dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
      durationMinutes: row.estimatedMinutes,
      order: index,
      context: null,
      linkedEventId: null,
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

  const { title, description, status, priority, dueDate, durationMinutes } = body as {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    dueDate?: string | null;
    durationMinutes?: number;
  };

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const validPriorities = ['low', 'medium', 'high'];

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
        dueDate: dueDate ? new Date(dueDate) : null,
        estimatedMinutes: typeof durationMinutes === 'number' ? durationMinutes : 30,
      })
      .returning({ id: tasks.id });

    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/tasks]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
