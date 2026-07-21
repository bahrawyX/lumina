/**
 * Batch 5 — cross-user data-leak regression tests. Each creates data as user A
 * and acts as user B (or seeds a cross-user row directly, simulating data
 * written before a fix), then asserts denial / no-leak against the REAL route
 * handler, or against the exact SQL the handler runs where the handler itself
 * drags in Gemini (daily-brief/intelligence) or a fire-and-forget async
 * fan-out (tasks/[id]) that can't be awaited deterministically.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { makeMultiUserTestDb, seedUser, type MultiUserTestDb } from './helpers/multiUserTestDb';

const h = vi.hoisted(() => ({
  db: null as unknown as MultiUserTestDb['db'],
  userId: null as string | null,
}));
vi.mock('@/lib/db', () => ({ getDatabase: () => h.db }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: async () => (h.userId ? { user: { id: h.userId } } : null) } },
}));

import { plannerItems, tasks } from '@/db/schema';
import { POST as plannerPost } from '@/app/api/planner-items/route';
import { GET as goalsGet } from '@/app/api/goals/route';
import { GET as intelligenceGet } from '@/app/api/intelligence/route';
import { POST as tasksPost } from '@/app/api/tasks/route';
import { POST as docsPost } from '@/app/api/docs/route';
import { POST as focusPost } from '@/app/api/focus-sessions/route';
import { POST as moodPost } from '@/app/api/mood-logs/route';
import { syncTaskCompletionTargets } from '@/lib/goals/syncTaskCompletionTargets';

let client: MultiUserTestDb['client'];

beforeAll(async () => {
  const t = await makeMultiUserTestDb();
  h.db = t.db;
  client = t.client;
});

function act(userId: string) { h.userId = userId; }
function post(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}
function get(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method: 'GET' });
}

async function one(sql: string, params: unknown[] = []): Promise<string> {
  const r = await client.query<{ id: string }>(sql, params);
  return r.rows[0].id;
}
const seedTask = (userId: string, o: { status?: string; goalId?: string; title?: string } = {}) =>
  one(`INSERT INTO tasks (user_id, title, status, goal_id) VALUES ($1,$2,$3,$4) RETURNING id`,
    [userId, o.title ?? 'task', o.status ?? 'todo', o.goalId ?? null]);
const seedGoal = (userId: string) => one(`INSERT INTO goals (user_id) VALUES ($1) RETURNING id`, [userId]);
const seedEvent = (userId: string) => one(`INSERT INTO events (user_id) VALUES ($1) RETURNING id`, [userId]);
const seedDoc = (userId: string) => one(`INSERT INTO docs (user_id) VALUES ($1) RETURNING id`, [userId]);
const seedSession = (userId: string) =>
  one(`INSERT INTO focus_sessions (user_id, duration_minutes) VALUES ($1, 25) RETURNING id`, [userId]);
const seedTarget = (goalId: string, linkedTaskIds: string[]) =>
  one(`INSERT INTO goal_targets (goal_id, type, linked_task_ids) VALUES ($1,'task_completion',$2) RETURNING id`,
    [goalId, JSON.stringify(linkedTaskIds)]);

// ── Finding 1 (M2): planner-items POST must not accept a foreign task ──────────
describe('Finding 1 — planner-items ownership', () => {
  it('rejects a task the caller does not own (404) and writes nothing', async () => {
    const A = await seedUser(client);
    const B = await seedUser(client);
    const aTask = await seedTask(A, { title: 'A private task' });

    act(B);
    const res = await plannerPost(post('/api/planner-items', {
      taskId: aTask,
      startTime: '2026-07-20T10:00:00.000Z',
      endTime: '2026-07-20T11:00:00.000Z',
    }));
    expect(res.status).toBe(404);

    const cnt = await client.query<{ c: number }>(
      `SELECT count(*)::int c FROM planner_items WHERE user_id = $1`, [B]);
    expect(cnt.rows[0].c).toBe(0);
  });

  it('accepts the caller’s own task (201)', async () => {
    const A = await seedUser(client);
    const aTask = await seedTask(A);
    act(A);
    const res = await plannerPost(post('/api/planner-items', {
      taskId: aTask,
      startTime: '2026-07-20T10:00:00.000Z',
      endTime: '2026-07-20T11:00:00.000Z',
    }));
    expect(res.status).toBe(201);
  });
});

// ── Finding 2 (M2): daily-brief / intelligence planner join must be user-scoped ─
describe('Finding 2 — planner→task join scoping', () => {
  it('the scoped join drops a foreign task title that the unscoped join leaks', async () => {
    const A = await seedUser(client);
    const B = await seedUser(client);
    const aTask = await seedTask(A, { title: 'A SECRET TASK' });
    // A planner row written before the fix: B's item pointing at A's task.
    await client.query(
      `INSERT INTO planner_items (user_id, task_id, start_time, end_time)
       VALUES ($1, $2, now(), now() + interval '1 hour')`, [B, aTask]);

    // Old (unscoped) join — proves the leak is real.
    const leaked = await h.db
      .select({ title: tasks.title })
      .from(plannerItems)
      .leftJoin(tasks, eq(plannerItems.taskId, tasks.id))
      .where(eq(plannerItems.userId, B));
    expect(leaked[0].title).toBe('A SECRET TASK');

    // New (scoped) join — the exact condition both handlers now use.
    const scoped = await h.db
      .select({ title: tasks.title })
      .from(plannerItems)
      .leftJoin(tasks, and(eq(plannerItems.taskId, tasks.id), eq(tasks.userId, B)))
      .where(eq(plannerItems.userId, B));
    expect(scoped[0].title).toBeNull();
  });

  it('intelligence GET (real handler) does not surface a foreign task title', async () => {
    const A = await seedUser(client);
    const B = await seedUser(client);
    const aTask = await seedTask(A, { title: 'A SECRET TASK' });
    // B's planner row → A's task, scheduled today (the handler queries today's plan).
    await client.query(
      `INSERT INTO planner_items (user_id, task_id, start_time, end_time)
       VALUES ($1, $2, now(), now() + interval '1 hour')`, [B, aTask]);

    act(B);
    const res = await intelligenceGet(get('/api/intelligence?includeNarrative=1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Scoped join → taskTitle null (mapped to 'Untitled task'); the foreign title
    // never reaches the engine output or the local narrative. Unscope the
    // handler's join and "A SECRET TASK" reappears in this response.
    expect(JSON.stringify(body)).not.toContain('A SECRET TASK');
  });
});

// ── Finding 3 + aggregation pollution (M14): goals progress must be user-scoped ─
describe('Finding 3 — goals aggregation scoping', () => {
  it('does not count another user’s task written against the caller’s goalId', async () => {
    const A = await seedUser(client);
    const B = await seedUser(client);
    const aGoal = await seedGoal(A);
    await seedTarget(aGoal, []);
    await seedTask(A, { status: 'done', goalId: aGoal, title: 'A own' });
    // Pollution: a row from before the FK fix — B's done task points at A's goal.
    await seedTask(B, { status: 'done', goalId: aGoal, title: 'B intruder' });

    act(A);
    const res = await goalsGet(get('/api/goals'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string; taskCount: number; completedTaskCount: number }>;
    const goal = body.find((g) => g.id === aGoal)!;
    // Only A's own task is counted — B's intruder row is excluded by the
    // userId-scoped aggregation, independently of the FK guard on create.
    expect(goal.taskCount).toBe(1);
    expect(goal.completedTaskCount).toBe(1);
  });
});

// ── Finding 4 (M14): task-completion fan-out must only touch the caller’s targets ─
describe('Finding 4 — target fan-out scoping', () => {
  it('syncTaskCompletionTargets recomputes only the caller’s target, never another user’s', async () => {
    const A = await seedUser(client);
    const B = await seedUser(client);
    const aGoal = await seedGoal(A);
    const bGoal = await seedGoal(B);
    const aTask = await seedTask(A, { status: 'done' });
    const aTarget = await seedTarget(aGoal, [aTask]);
    // B crafts a target linking A's task id (a row from before the FK fix).
    const bTarget = await seedTarget(bGoal, [aTask]);

    // The exact fan-out the PATCH handler runs — now an awaitable, userId-scoped
    // helper. Running it as A must touch only A's target.
    await syncTaskCompletionTargets(h.db as unknown as Parameters<typeof syncTaskCompletionTargets>[0], A, aTask);

    const rows = await client.query<{ id: string; current_value: string }>(
      `SELECT id, current_value FROM goal_targets WHERE id IN ($1, $2)`, [aTarget, bTarget]);
    const byId = new Map(rows.rows.map((r) => [r.id, r.current_value]));
    expect(Number(byId.get(aTarget))).toBe(1); // recomputed: 1 linked task done
    expect(Number(byId.get(bTarget))).toBe(0); // untouched — never read or updated
  });
});

// ── Finding 5 (FK ownership on create): each create rejects a foreign FK (404) ──
describe('Finding 5 — FK ownership on create', () => {
  it('tasks POST rejects foreign goalId / linkedEventId / linkedDocId, accepts own', async () => {
    const A = await seedUser(client);
    const B = await seedUser(client);
    const aGoal = await seedGoal(A);
    const aEvent = await seedEvent(A);
    const aDoc = await seedDoc(A);

    act(B);
    expect((await tasksPost(post('/api/tasks', { title: 't', goalId: aGoal }))).status).toBe(404);
    expect((await tasksPost(post('/api/tasks', { title: 't', linkedEventId: aEvent }))).status).toBe(404);
    expect((await tasksPost(post('/api/tasks', { title: 't', linkedDocId: aDoc }))).status).toBe(404);

    const bGoal = await seedGoal(B);
    expect((await tasksPost(post('/api/tasks', { title: 't', goalId: bGoal }))).status).toBe(201);
  });

  it('docs POST rejects foreign linkedTaskId / linkedEventId', async () => {
    const A = await seedUser(client);
    const B = await seedUser(client);
    const aTask = await seedTask(A);
    const aEvent = await seedEvent(A);

    act(B);
    expect((await docsPost(post('/api/docs', { title: 'd', linkedTaskId: aTask }))).status).toBe(404);
    expect((await docsPost(post('/api/docs', { title: 'd', linkedEventId: aEvent }))).status).toBe(404);
  });

  it('focus-sessions POST rejects foreign taskId / goalId', async () => {
    const A = await seedUser(client);
    const B = await seedUser(client);
    const aTask = await seedTask(A);
    const aGoal = await seedGoal(A);
    const timed = { startTime: '2026-07-20T10:00:00.000Z', endTime: '2026-07-20T10:01:00.000Z', duration: 60 };

    act(B);
    expect((await focusPost(post('/api/focus-sessions', { ...timed, taskId: aTask }))).status).toBe(404);
    expect((await focusPost(post('/api/focus-sessions', { ...timed, goalId: aGoal }))).status).toBe(404);
  });

  it('mood-logs POST rejects a foreign focusSessionId', async () => {
    const A = await seedUser(client);
    const B = await seedUser(client);
    const aSession = await seedSession(A);

    act(B);
    expect((await moodPost(post('/api/mood-logs', { mood: 'good', focusSessionId: aSession }))).status).toBe(404);
    // B can log a mood with no session reference.
    expect((await moodPost(post('/api/mood-logs', { mood: 'good' }))).status).toBe(201);
  });
});
