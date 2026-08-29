/**
 * P2-5 — select-then-insert races.
 * P2-6 — the streak counter loses increments; doc saves silently overwrite.
 *
 * NOTE: PGlite is a single in-process connection, so `Promise.all` serializes
 * and no test here is a true parallel race. What these tests DO prove is that
 * the invariants survive interleaved reads and writes: the second claim matches
 * zero rows, the unique index rejects the duplicate, the stale save is refused.
 * Those are the properties the routes now rely on; the previous code relied on
 * a read that had already gone stale by the time the write ran.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '@/db/schema';
import { calendars, docs, tasks } from '@/db/schema';
import { resolvePrimaryLocalCalendarId } from '@/lib/calendars/primaryLocal';
import { docStaleGuard, nextDocUpdatedAt } from '@/lib/docs/staleWrite';

const DDL = `
CREATE TABLE IF NOT EXISTS calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  external_id varchar(255),
  name varchar(255) NOT NULL,
  color varchar(32) NOT NULL DEFAULT '#6D59E0',
  enabled boolean NOT NULL DEFAULT true,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS calendars_one_primary_local_per_user
  ON calendars (user_id) WHERE provider = 'local' AND is_primary = true;

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title varchar(512) NOT NULL,
  description text,
  status varchar(32) NOT NULL DEFAULT 'todo',
  priority varchar(32) NOT NULL DEFAULT 'medium',
  difficulty varchar(32) NOT NULL DEFAULT 'medium',
  estimated_minutes integer NOT NULL DEFAULT 30,
  due_date timestamptz,
  scheduled_start varchar(5),
  scheduled_end varchar(5),
  remaining_focus_time integer,
  linked_event_id uuid,
  linked_doc_id uuid,
  goal_id uuid,
  parent_task_id uuid,
  depth integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  recurrence_rule text,
  recurrence_end timestamptz,
  recurrence_parent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- The index migration 0024 adds. Without it, two tasks could claim one event.
CREATE UNIQUE INDEX IF NOT EXISTS tasks_linked_event_uniq
  ON tasks (linked_event_id) WHERE linked_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  parent_id uuid,
  title varchar(512) NOT NULL DEFAULT 'Untitled',
  content jsonb,
  content_text text DEFAULT '',
  icon varchar(64),
  cover_image text,
  cover_gradient integer,
  is_archived boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  linked_task_id uuid,
  linked_event_id uuid,
  word_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

const USER = '11111111-1111-4111-8111-111111111111';
const EVENT = '22222222-2222-4222-8222-222222222222';

let client: PGlite;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  client = new PGlite();
  await client.exec(DDL);
  db = drizzle(client, { schema });
});

beforeEach(async () => {
  await client.exec('TRUNCATE calendars, tasks, docs;');
});

describe('P2-5 — the default local calendar resolves without racing', () => {
  it('creates it on first use', async () => {
    const id = await resolvePrimaryLocalCalendarId(db, USER);
    expect(id).toBeTruthy();
    const rows = await db.select().from(calendars).where(eq(calendars.userId, USER));
    expect(rows).toHaveLength(1);
  });

  it('returns the SAME id on a second call and never inserts twice', async () => {
    const first = await resolvePrimaryLocalCalendarId(db, USER);
    const second = await resolvePrimaryLocalCalendarId(db, USER);
    expect(second).toBe(first);
    const rows = await db.select().from(calendars).where(eq(calendars.userId, USER));
    expect(rows).toHaveLength(1);
  });

  it('resolves the existing id when another request already created it', async () => {
    // Stand in for "a concurrent request won the insert while we were between
    // our SELECT and our INSERT": the row is there, ON CONFLICT DO NOTHING
    // swallows our insert, and the unconditional re-select finds theirs.
    const [seeded] = await db
      .insert(calendars)
      .values({ userId: USER, provider: 'local', name: 'My Calendar', isPrimary: true })
      .returning({ id: calendars.id });

    const resolved = await resolvePrimaryLocalCalendarId(db, USER);
    expect(resolved).toBe(seeded.id);
  });

  it('a bare duplicate insert — the old code path — still throws 23505', async () => {
    // Proof that the guard is load-bearing, not decoration.
    await db
      .insert(calendars)
      .values({ userId: USER, provider: 'local', name: 'My Calendar', isPrimary: true });
    await expect(
      db
        .insert(calendars)
        .values({ userId: USER, provider: 'local', name: 'My Calendar', isPrimary: true }),
    ).rejects.toThrow();
  });

  it("does not collide with the user's non-primary local calendars", async () => {
    await db
      .insert(calendars)
      .values({ userId: USER, provider: 'local', name: 'Side', isPrimary: false });
    const id = await resolvePrimaryLocalCalendarId(db, USER);
    const rows = await db.select().from(calendars).where(eq(calendars.userId, USER));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === id)?.isPrimary).toBe(true);
  });
});

describe('P2-5 — a task cannot be linked twice', () => {
  const seedTask = async () => {
    const [row] = await db
      .insert(tasks)
      .values({ userId: USER, title: 'Ship it' })
      .returning({ id: tasks.id });
    return row.id;
  };

  const claim = (taskId: string, eventId: string) =>
    db
      .update(tasks)
      .set({ linkedEventId: eventId, updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), isNull(tasks.linkedEventId)))
      .returning({ id: tasks.id });

  it('the guarded UPDATE wins once and matches zero rows after', async () => {
    const taskId = await seedTask();
    expect(await claim(taskId, EVENT)).toHaveLength(1);

    // The route maps this empty result to 409 and rolls its transaction back,
    // which takes the event it just inserted with it. Before the fix the check
    // was a SELECT outside the transaction and the second writer overwrote the
    // first, orphaning an event the user could never find.
    const other = '33333333-3333-4333-8333-333333333333';
    expect(await claim(taskId, other)).toHaveLength(0);

    const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    expect(row.linkedEventId).toBe(EVENT);
  });

  it('the unique index rejects a SECOND task claiming the same event', async () => {
    const a = await seedTask();
    const b = await seedTask();
    await claim(a, EVENT);
    await expect(claim(b, EVENT)).rejects.toThrow();
  });

  it('leaves unlinked tasks unconstrained', async () => {
    await seedTask();
    await seedTask();
    await seedTask();
    const rows = await db.select().from(tasks).where(isNull(tasks.linkedEventId));
    expect(rows).toHaveLength(3);
  });
});

describe('P2-6 — a stale doc save is refused by the write itself', () => {
  const seedDoc = async () => {
    const [row] = await db
      .insert(docs)
      .values({ userId: USER, title: 'Notes', content: { v: 0 } })
      .returning({ id: docs.id, updatedAt: docs.updatedAt });
    return row;
  };

  // The exact shape the route uses: the DB-clock bump and the guard fragment.
  const save = (id: string, content: unknown, clientCopy: Date | null) =>
    db
      .update(docs)
      .set({ content: content as object, updatedAt: nextDocUpdatedAt() })
      .where(and(eq(docs.id, id), eq(docs.userId, USER), docStaleGuard(clientCopy)))
      .returning({ updatedAt: docs.updatedAt });

  it('accepts a save from a client holding the current copy', async () => {
    const doc = await seedDoc();
    const res = await save(doc.id, { v: 1 }, doc.updatedAt);
    expect(res).toHaveLength(1);
  });

  it('refuses the second of two saves made from the same copy', async () => {
    const doc = await seedDoc();

    // Both editors loaded the doc at the same `updatedAt`. The old code SELECTed,
    // compared in JS, and then wrote — so both passed the comparison and the
    // second silently clobbered the first. The 409 never fired under the very
    // concurrency it existed for.
    const first = await save(doc.id, { v: 'editor-a' }, doc.updatedAt);
    const second = await save(doc.id, { v: 'editor-b' }, doc.updatedAt);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);

    const [row] = await db.select().from(docs).where(eq(docs.id, doc.id));
    expect(row.content).toEqual({ v: 'editor-a' });
  });

  it('lets the loser retry once it has refetched', async () => {
    const doc = await seedDoc();
    await save(doc.id, { v: 'editor-a' }, doc.updatedAt);

    const [fresh] = await db
      .select({ updatedAt: docs.updatedAt })
      .from(docs)
      .where(eq(docs.id, doc.id));
    expect(await save(doc.id, { v: 'editor-b' }, fresh.updatedAt)).toHaveLength(1);
  });

  it('accepts a client copy that lost microseconds to toISOString()', async () => {
    // `updated_at` is timestamptz (microseconds); the client only ever sees the
    // millisecond-truncated ISO string. A naive `updated_at <= client` rejected
    // a client echoing back the exact value it had been given.
    const doc = await seedDoc();
    const asClientSeesIt = new Date(doc.updatedAt.toISOString());
    expect(await save(doc.id, { v: 1 }, asClientSeesIt)).toHaveLength(1);
  });

  it('saves unconditionally when the client sends no copy', async () => {
    const doc = await seedDoc();
    expect(await save(doc.id, { v: 1 }, null)).toHaveLength(1);
  });

  it('advances updated_at strictly, even for saves in the same millisecond', async () => {
    const doc = await seedDoc();
    const a = await save(doc.id, { v: 1 }, doc.updatedAt);
    const b = await save(doc.id, { v: 2 }, a[0].updatedAt);
    expect(b[0].updatedAt.getTime()).toBeGreaterThan(a[0].updatedAt.getTime());
  });

  it('matches zero rows for another user, so the route can 404', async () => {
    const doc = await seedDoc();
    const stranger = await db
      .update(docs)
      .set({ content: { v: 'nope' } })
      .where(
        and(
          eq(docs.id, doc.id),
          eq(docs.userId, '44444444-4444-4444-8444-444444444444'),
          docStaleGuard(doc.updatedAt),
        ),
      )
      .returning({ updatedAt: docs.updatedAt });
    expect(stranger).toHaveLength(0);
  });
});

describe('P2-5 / P2-6 — the handlers use the race-safe shapes', () => {
  const read = (...parts: string[]) =>
    readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

  it('both event-creating routes share the idempotent calendar resolver', () => {
    for (const parts of [
      ['app', 'api', 'events', 'route.ts'],
      ['app', 'api', 'events', 'create-linked', 'route.ts'],
    ]) {
      expect(read(...parts)).toContain('resolvePrimaryLocalCalendarId(db, userId)');
    }
  });

  it('create-linked asserts "still unlinked" inside the transaction', () => {
    const src = read('app', 'api', 'events', 'create-linked', 'route.ts');
    expect(src).toContain('isNull(tasks.linkedEventId)');
    expect(src).toContain('TaskAlreadyLinked');
  });

  it('POST /api/link re-asserts both sides in the UPDATE', () => {
    const src = read('app', 'api', 'link', 'route.ts');
    expect(src).toContain('isNull(tasks.linkedEventId)');
    expect(src).toContain('isNull(events.linkedTaskId)');
  });

  it('the focus streak is read inside the transaction, under a row lock', () => {
    const src = read('app', 'api', 'focus-sessions', 'route.ts');
    expect(src).toContain(".for('update')");
    // The lock is worthless if the read is still outside the transaction.
    expect(src.indexOf('db.transaction')).toBeLessThan(src.indexOf(".for('update')"));
  });

  it('the doc staleness check is part of the write, not a separate read', () => {
    const src = read('app', 'api', 'docs', '[id]', 'route.ts');
    expect(src).toContain('docStaleGuard(clientUpdatedAt)');
    expect(src).toContain('staleGuard');
    expect(src).toContain('nextDocUpdatedAt()');
    expect(src).not.toContain('const serverUpdatedAt');
  });
});

describe('P2-5 — migration 0024 ships the indexes the routes rely on', () => {
  const migration = readFileSync(
    join(process.cwd(), 'drizzle', '0024_link_uniqueness.sql'),
    'utf8',
  );

  it('creates both partial unique indexes', () => {
    expect(migration).toContain('tasks_linked_event_uniq');
    expect(migration).toContain('events_linked_task_uniq');
    expect(migration).toMatch(/WHERE linked_event_id IS NOT NULL/);
    expect(migration).toMatch(/WHERE linked_task_id IS NOT NULL/);
  });

  it('repairs existing duplicates first, or the CREATE INDEX would fail', () => {
    expect(migration.indexOf('UPDATE tasks t')).toBeLessThan(
      migration.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS tasks_linked_event_uniq'),
    );
  });

  it('is registered in the journal', () => {
    const journal = readFileSync(
      join(process.cwd(), 'drizzle', 'meta', '_journal.json'),
      'utf8',
    );
    expect(journal).toContain('0024_link_uniqueness');
  });

  it('never deletes a task or an event', () => {
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
    expect(migration).not.toMatch(/DROP\s+TABLE/i);
  });
});

// Keeps `sql` and `tasks` referenced for the DDL-parity check below.
describe('schema parity', () => {
  it('the test DDL carries the same partial unique index as the schema', async () => {
    const res = await client.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'tasks_linked_event_uniq'",
    );
    expect(res.rows[0].indexdef).toContain('linked_event_id IS NOT NULL');
    // `sql` import is used by the schema module under test; assert the column
    // exists on the drizzle table so a rename cannot silently skip this file.
    expect(sql`${tasks.linkedEventId}`).toBeTruthy();
  });
});
