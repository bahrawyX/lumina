/**
 * Traces the ACTUAL task PATCH award response against in-process Postgres —
 * what the client receives on a real completion vs a duplicate. Guards the
 * client contract (newBalance for the badge, coinsEarned to gate the toast).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { makeCoinTestDb, seedUser, type CoinTestDb } from './helpers/coinTestDb';

const h = vi.hoisted(() => ({ db: null as unknown as CoinTestDb['db'], userId: '' }));
vi.mock('@/lib/db', () => ({ getDatabase: () => h.db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: async () => ({ user: { id: h.userId } }) } } }));

import { PATCH } from '@/app/api/tasks/[id]/route';

let client: CoinTestDb['client'];

beforeAll(async () => {
  const t = await makeCoinTestDb();
  h.db = t.db;
  client = t.client;
  await client.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      title varchar(500) NOT NULL DEFAULT 'x',
      status varchar(20) NOT NULL DEFAULT 'todo',
      difficulty varchar(10) NOT NULL DEFAULT 'medium',
      due_date timestamptz,
      parent_task_id uuid,
      priority varchar(10),
      estimated_minutes integer NOT NULL DEFAULT 30,
      goal_id uuid,
      position integer NOT NULL DEFAULT 0,
      description text,
      recurrence_rule text,
      recurrence_end timestamptz,
      recurrence_parent_id uuid,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS goal_targets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      type varchar(30) NOT NULL,
      linked_task_ids text,
      current_value numeric DEFAULT 0,
      updated_at timestamptz DEFAULT now()
    );
  `);
});

function patchReq(id: string, body: unknown) {
  return new Request(`http://localhost/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof PATCH>[0];
}

async function seedTask(userId: string, status = 'todo', difficulty = 'hard'): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO tasks (user_id, status, difficulty) VALUES ($1,$2,$3) RETURNING id`,
    [userId, status, difficulty],
  );
  return r.rows[0].id;
}

describe('task PATCH award response contract', () => {
  it('a real completion returns newBalance AND coinsEarned>0 and writes a ledger row', async () => {
    h.userId = await seedUser(client, { coins: 0 });
    const taskId = await seedTask(h.userId, 'todo', 'hard');

    const res = await PATCH(patchReq(taskId, { status: 'done' }), { params: Promise.resolve({ id: taskId }) });
    const json = (await res.json()) as { ok: boolean; newBalance?: number; coinsEarned?: number };

    expect(json.ok).toBe(true);
    // A hard task's first completion of the day awards task_complete (10) +
    // first_task_day (5) = 15. coinsEarned must be the coin SUM, not the entry
    // count (2) — the toast shows "+15", not "+2".
    expect(json.coinsEarned).toBe(15);
    expect(json.newBalance).toBe(15); // balance 0 → 15, badge sync

    const ledger = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM coin_transactions WHERE user_id = $1 AND reason = 'task_complete'`,
      [h.userId],
    );
    expect(ledger.rows[0].n).toBe(1);
  });

  it('re-completion awards nothing: coinsEarned is 0, no toast should fire', async () => {
    h.userId = await seedUser(client, { coins: 0 });
    const taskId = await seedTask(h.userId, 'todo', 'hard');

    await PATCH(patchReq(taskId, { status: 'done' }), { params: Promise.resolve({ id: taskId }) });
    // Toggle back to todo, then complete again — the exploit path.
    await PATCH(patchReq(taskId, { status: 'todo' }), { params: Promise.resolve({ id: taskId }) });
    const res = await PATCH(patchReq(taskId, { status: 'done' }), { params: Promise.resolve({ id: taskId }) });
    const json = (await res.json()) as { coinsEarned?: number };

    expect(json.coinsEarned).toBe(0); // duplicate — nothing awarded → no toast
  });
});
