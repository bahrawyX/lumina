/**
 * Schema validation for request bodies.
 *
 * The hand-rolled checks these replace were safe against type confusion — a bad
 * value was skipped rather than written — but silent about it, and silence is
 * where the bugs were:
 *
 *  - `typeof x === 'number'` accepted `-5` and `1e9` for a duration, the second
 *    overflowing an `integer` column;
 *  - a mood note was `.slice(0, 140)`'d on the way to an unbounded `text`
 *    column, while one of the two note inputs in the UI allows 200 — so the
 *    tail of a reflection was discarded with a 201 and no indication;
 *  - `POST /api/goals` rejected an inverted date range and `PATCH` did not,
 *    because the rule lived in a handler rather than in a shape both shared.
 */
import { describe, it, expect } from 'vitest';
import {
  createTaskSchema,
  updateTaskSchema,
  createGoalSchema,
  updateGoalSchema,
  createMoodLogSchema,
} from '@/lib/api/schemas';

describe('bounds that the manual checks did not have', () => {
  it('rejects a negative duration', () => {
    expect(createTaskSchema.safeParse({ title: 'x', durationMinutes: -5 }).success).toBe(false);
  });

  it('rejects a duration that would overflow the column', () => {
    expect(createTaskSchema.safeParse({ title: 'x', durationMinutes: 1e9 }).success).toBe(false);
  });

  it('rejects a fractional duration', () => {
    expect(createTaskSchema.safeParse({ title: 'x', durationMinutes: 12.5 }).success).toBe(false);
  });

  it('accepts an ordinary one', () => {
    expect(createTaskSchema.safeParse({ title: 'x', durationMinutes: 45 }).success).toBe(true);
  });

  it('rejects an empty title rather than writing one', () => {
    expect(createTaskSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('rejects a title past the column width', () => {
    expect(createTaskSchema.safeParse({ title: 'x'.repeat(513) }).success).toBe(false);
  });

  it('rejects an unparseable date instead of storing Invalid Date', () => {
    expect(createTaskSchema.safeParse({ title: 'x', dueDate: 'next tuesday' }).success).toBe(false);
  });

  it('rejects a malformed clock time', () => {
    expect(createTaskSchema.safeParse({ title: 'x', scheduledStart: '25:00' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'x', scheduledStart: '09:00' }).success).toBe(true);
  });

  it('rejects an id that is not a uuid', () => {
    // These become foreign keys. A junk string means a failed insert reported
    // as a 500 rather than a 400 naming the field.
    expect(createTaskSchema.safeParse({ title: 'x', goalId: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('partial updates stay partial', () => {
  it('accepts a single field', () => {
    // A schema that required fields would break every caller that sends one
    // thing — which is most of them.
    expect(updateTaskSchema.safeParse({ status: 'done' }).success).toBe(true);
    expect(updateTaskSchema.safeParse({}).success).toBe(true);
  });

  it('still bounds the fields that are present', () => {
    expect(updateTaskSchema.safeParse({ durationMinutes: -1 }).success).toBe(false);
  });

  it('accepts the reorder field the board sends', () => {
    expect(updateTaskSchema.safeParse({ order: 3 }).success).toBe(true);
    expect(updateTaskSchema.safeParse({ order: -1 }).success).toBe(false);
  });
});

describe('the goal date range rule lives in one place', () => {
  it('rejects an inverted range on create', () => {
    const result = createGoalSchema.safeParse({
      title: 'Ship it',
      startDate: '2026-08-24T00:00:00.000Z',
      endDate: '2026-08-10T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects it on update too — the gap that let "Aug 24 – Aug 10" exist', () => {
    const result = updateGoalSchema.safeParse({
      startDate: '2026-08-24T00:00:00.000Z',
      endDate: '2026-08-10T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('allows a partial update that moves only one end', () => {
    // The schema cannot compare against the stored row, so a one-ended PATCH
    // has to pass here and be checked in the handler. Rejecting it would make
    // "change the end date" impossible.
    expect(updateGoalSchema.safeParse({ endDate: '2026-08-10T00:00:00.000Z' }).success).toBe(true);
  });

  it('names the field that broke the rule', () => {
    const result = updateGoalSchema.safeParse({
      startDate: '2026-08-24T00:00:00.000Z',
      endDate: '2026-08-10T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['endDate']);
    }
  });
});

describe('mood notes are no longer silently truncated', () => {
  it('accepts the full length the UI allows', () => {
    // `MoodAnalysisCard` permits 200 and `mood_logs.note` is unbounded `text`,
    // so the old `.slice(0, 140)` discarded 60 characters the database would
    // have stored.
    expect(createMoodLogSchema.safeParse({ mood: 'good', note: 'y'.repeat(200) }).success).toBe(true);
  });

  it('rejects longer, rather than trimming it away quietly', () => {
    const result = createMoodLogSchema.safeParse({ mood: 'good', note: 'y'.repeat(250) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/200 characters/);
    }
  });

  it('rejects an unknown mood', () => {
    expect(createMoodLogSchema.safeParse({ mood: 'ecstatic' }).success).toBe(false);
  });
});

describe('the error shape is actionable and safe', () => {
  it('names the field and the rule', async () => {
    const { parseBody } = await import('@/lib/api/parseBody');
    const req = new Request('http://localhost/api/mood-logs', {
      method: 'POST',
      body: JSON.stringify({ mood: 'ecstatic' }),
      headers: { 'content-type': 'application/json' },
    });
    const parsed = await parseBody(req, createMoodLogSchema);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      const body = (await parsed.response.json()) as {
        error: string;
        details: { field: string; message: string }[];
      };
      expect(body.details[0].field).toBe('mood');
      // A generic "Invalid request body" leaves the caller guessing which of
      // fifteen fields was wrong.
      expect(body.details[0].message.length).toBeGreaterThan(0);
    }
  });

  it('does not echo the submitted value back', async () => {
    // P3-3 spent effort removing user-controlled content from error responses;
    // a validation message must not put it back.
    const { parseBody } = await import('@/lib/api/parseBody');
    const secret = 'sensitive-value-12345';
    const req = new Request('http://localhost/api/mood-logs', {
      method: 'POST',
      body: JSON.stringify({ mood: secret }),
      headers: { 'content-type': 'application/json' },
    });
    const parsed = await parseBody(req, createMoodLogSchema);
    if (!parsed.ok) {
      expect(await parsed.response.text()).not.toContain(secret);
    }
  });

  it('reports malformed JSON separately from a schema failure', async () => {
    const { parseBody } = await import('@/lib/api/parseBody');
    const req = new Request('http://localhost/api/mood-logs', {
      method: 'POST',
      body: '{ not json',
      headers: { 'content-type': 'application/json' },
    });
    const parsed = await parseBody(req, createMoodLogSchema);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect((await parsed.response.json()).error).toBe('Invalid JSON');
    }
  });
});

describe('null clears, undefined leaves alone', () => {
  // The handlers build their patch objects field by field precisely because
  // these two mean different things, and it differs per field. If the schema
  // collapsed `null` into "absent", a PATCH meant to clear a due date would
  // silently do nothing.
  it('keeps the two distinguishable on the clearable fields', () => {
    const cleared = updateTaskSchema.parse({
      dueDate: null,
      scheduledStart: null,
      scheduledEnd: null,
      remainingFocusTime: null,
      linkedEventId: null,
      goalId: null,
    });
    expect(cleared.dueDate).toBeNull();
    expect(cleared.scheduledStart).toBeNull();
    expect(cleared.remainingFocusTime).toBeNull();
    expect(cleared.goalId).toBeNull();

    const untouched = updateTaskSchema.parse({ title: 'only this' });
    expect('dueDate' in untouched).toBe(false);
    expect('goalId' in untouched).toBe(false);
  });

  it('does not let null through on a field the column cannot clear', () => {
    // `tasks.status` is NOT NULL. Accepting null here would move the failure
    // from a 400 to a Postgres 23502 surfaced as a 500.
    expect(updateTaskSchema.safeParse({ status: null }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ priority: null }).success).toBe(false);
  });
});

describe('remainingFocusTime is seconds, and stays roundable', () => {
  it('accepts a fractional value rather than rejecting a float timer tick', () => {
    // PomodoroView sends `remainingSecs`. The handler rounds, as it always
    // did; forcing .int() here would 400 a perfectly ordinary timer.
    expect(updateTaskSchema.safeParse({ remainingFocusTime: 137.4 }).success).toBe(true);
  });

  it('still refuses a negative or non-finite one', () => {
    expect(updateTaskSchema.safeParse({ remainingFocusTime: -1 }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ remainingFocusTime: Number.POSITIVE_INFINITY }).success).toBe(false);
  });
});

describe('goal targets are no longer silently dropped', () => {
  it('rejects a blank-titled target instead of skipping it', () => {
    // The handler used to `continue` past it: three targets in, two saved,
    // 201 returned, nothing said.
    const result = createGoalSchema.safeParse({
      title: 'Ship it',
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-31T00:00:00.000Z',
      targets: [
        { title: 'Real one', type: 'number', targetValue: 10 },
        { title: '  ', type: 'number', targetValue: 5 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('names which target was wrong', () => {
    const result = createGoalSchema.safeParse({
      title: 'Ship it',
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-31T00:00:00.000Z',
      targets: [
        { title: 'Real one', type: 'number', targetValue: 10 },
        { title: 'Bad type', type: 'vibes', targetValue: 5 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['targets', 1, 'type']);
    }
  });

  it('accepts a well-formed set', () => {
    expect(
      createGoalSchema.safeParse({
        title: 'Ship it',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-31T00:00:00.000Z',
        targets: [{ title: 'Ten things', type: 'number', targetValue: 10, unit: 'things' }],
      }).success,
    ).toBe(true);
  });
});

describe('unknown keys are stripped, never rejected', () => {
  /**
   * This is the constraint that makes the whole conversion safe, and it is
   * worth a test of its own because a later `.strict()` would look like a
   * tightening and would in fact break task creation everywhere at once.
   *
   * `tasksPersistence.createOne` does not build a request body — it spreads
   * the entire client-side `Task`:
   *
   *     const payload = { ...task, status: mapUiStatusToDb(task.status) };
   *
   * so `id`, `order`, `context`, `depth`, `dbStatus`, `createdAt` and
   * `updatedAt` all go over the wire on every create. `guestMigration` does
   * the same minus `id`. None of those are columns the create handler writes.
   */
  const fullClientTask = {
    id: 'client-side-nanoid-not-a-uuid',
    title: 'Spread the whole object',
    description: 'from the board',
    status: 'todo',
    dbStatus: 'todo',
    priority: 'high',
    difficulty: 'hard',
    durationMinutes: 60,
    scheduledStart: '09:00',
    order: 7,
    context: null,
    depth: 0,
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-29T00:00:00.000Z',
  };

  it('accepts the whole client Task object', () => {
    const result = createTaskSchema.safeParse(fullClientTask);
    expect(result.success).toBe(true);
  });

  it('drops the client id, so it can never become the row id', () => {
    // The audit's mass-assignment probe established that an injected id is
    // ignored. Stripping keeps that true by construction.
    const parsed = createTaskSchema.parse(fullClientTask);
    expect('id' in parsed).toBe(false);
    expect('context' in parsed).toBe(false);
    expect('depth' in parsed).toBe(false);
    expect('createdAt' in parsed).toBe(false);
  });

  it('keeps every field that IS a column', () => {
    const parsed = createTaskSchema.parse(fullClientTask);
    expect(parsed.title).toBe('Spread the whole object');
    expect(parsed.priority).toBe('high');
    expect(parsed.difficulty).toBe('hard');
    expect(parsed.durationMinutes).toBe(60);
    expect(parsed.scheduledStart).toBe('09:00');
  });

  it('tolerates the same spread on update', () => {
    expect(updateTaskSchema.safeParse(fullClientTask).success).toBe(true);
  });
});

// ── Events ───────────────────────────────────────────────────────────────────

/**
 * Events were the largest remaining hand-rolled surface: 52 `typeof` checks in
 * the PATCH handler and 18 in the POST. Converting them turned up two real
 * defects rather than just tidying.
 */
describe('the event columns that nobody was bounding', () => {
  const base = {
    title: 'Standup',
    date: '2026-09-01',
    startTime: '09:00',
    endTime: '09:30',
  };

  it('rejects a category longer than varchar(64)', async () => {
    // `checkFieldLengths` in `POST /api/events` covered title, description and
    // location and stopped. `category` went to the driver as a 22001 and came
    // back a 500 — the P3-2 defect, fixed for three fields and missed for this.
    const { createEventSchema } = await import('@/lib/api/schemas');
    expect(createEventSchema.safeParse({ ...base, category: 'x'.repeat(65) }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, category: 'Work' }).success).toBe(true);
  });

  it('rejects a colour longer than varchar(32)', async () => {
    const { createEventSchema } = await import('@/lib/api/schemas');
    expect(createEventSchema.safeParse({ ...base, color: 'x'.repeat(33) }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, color: '#6D59E0' }).success).toBe(true);
  });

  it('rejects an externalId longer than varchar(255)', async () => {
    const { createEventSchema } = await import('@/lib/api/schemas');
    expect(createEventSchema.safeParse({ ...base, externalId: 'x'.repeat(256) }).success).toBe(false);
  });
});

describe('the events PATCH, which bounded nothing at all', () => {
  it('now rejects an over-long title instead of handing it to the driver', async () => {
    // There was no `checkFieldLengths` in this handler — none, for any field.
    // So `POST /api/events` answered 400 for a 100,000-character title while
    // the edit path answered 500 for the same value.
    const { updateEventSchema } = await import('@/lib/api/schemas');
    expect(updateEventSchema.safeParse({ title: 'x'.repeat(513) }).success).toBe(false);
    expect(updateEventSchema.safeParse({ title: 'Renamed' }).success).toBe(true);
  });

  it('bounds description and location on the edit path too', async () => {
    const { updateEventSchema } = await import('@/lib/api/schemas');
    expect(updateEventSchema.safeParse({ location: 'x'.repeat(501) }).success).toBe(false);
    expect(updateEventSchema.safeParse({ description: 'x'.repeat(10_001) }).success).toBe(false);
  });

  it('rejects an unknown syncStatus rather than dropping it', async () => {
    // Was an `includes()` check with no else — an unrecognised value left the
    // field unassigned and the request still answered 200.
    const { updateEventSchema } = await import('@/lib/api/schemas');
    expect(updateEventSchema.safeParse({ syncStatus: 'probably_synced' }).success).toBe(false);
    expect(updateEventSchema.safeParse({ syncStatus: 'pending_update' }).success).toBe(true);
  });

  it('rejects an unknown editScope rather than silently editing the whole series', async () => {
    // `editScope` decides whether an edit hits one occurrence or the whole
    // series. Only `'this'` and `'this_and_following'` take a branch of their
    // own; the old code resolved anything unrecognised to `undefined`, which
    // falls straight through to the UPDATE on the master row — so a typo here
    // edited every occurrence instead of the one that was open. (The rrule
    // itself is separately gated on `=== 'all'`, so that part was unaffected.)
    const { updateEventSchema } = await import('@/lib/api/schemas');
    expect(updateEventSchema.safeParse({ editScope: 'this_one' }).success).toBe(false);
    for (const scope of ['this', 'this_and_following', 'all']) {
      expect(updateEventSchema.safeParse({ editScope: scope }).success).toBe(true);
    }
  });
});

describe('recurrence exdates reach the expansion engine intact', () => {
  it('rejects entries that are not dates', async () => {
    // Was `Array.isArray(exdates) ? exdates : []` — any array at all was
    // written, and the recurrence engine met the contents later.
    const { eventRecurrenceSchema } = await import('@/lib/api/schemas');
    expect(eventRecurrenceSchema.safeParse({ exdates: ['not-a-date'] }).success).toBe(false);
    expect(eventRecurrenceSchema.safeParse({ exdates: [12345] }).success).toBe(false);
  });

  it('accepts real ones', async () => {
    const { eventRecurrenceSchema } = await import('@/lib/api/schemas');
    expect(
      eventRecurrenceSchema.safeParse({
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        exdates: ['2026-09-07T09:00:00.000Z'],
      }).success,
    ).toBe(true);
  });
});

describe('event date fields keep the format the time helpers require', () => {
  it('rejects a date that zonedWallClockToUtc would reject anyway', async () => {
    // It enforces `YYYY-MM-DD` and returns null otherwise, which surfaced as
    // "Valid start and end timestamps are required" — true, but it never said
    // which field was wrong.
    const { createEventSchema } = await import('@/lib/api/schemas');
    const base = { title: 'x', startTime: '09:00', endTime: '10:00' };
    expect(createEventSchema.safeParse({ ...base, date: '01/09/2026' }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, date: '2026-09-01' }).success).toBe(true);
  });

  it('rejects a malformed clock time', async () => {
    const { createEventSchema } = await import('@/lib/api/schemas');
    expect(
      createEventSchema.safeParse({ title: 'x', date: '2026-09-01', startTime: '25:00' }).success,
    ).toBe(false);
  });
});

describe('the whole client CalendarEvent still posts', () => {
  it('strips the keys the server has no column for', async () => {
    // `eventsPersistence.createOne` spreads the entire client event, and
    // `guestMigration` posts every field but `id`. Same load-bearing stripping
    // as tasks: `.strict()` here would break event creation everywhere.
    const { createEventSchema } = await import('@/lib/api/schemas');
    const result = createEventSchema.safeParse({
      id: 'client-nanoid',
      title: 'Spread me',
      date: '2026-09-01',
      startTime: '09:00',
      endTime: '10:00',
      provider: 'local',
      source: 'manual',
      outlookId: undefined,
      editable: true,
      readOnly: false,
      draggable: true,
      organizer: 'someone@example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('id' in result.data).toBe(false);
      expect('editable' in result.data).toBe(false);
      expect(result.data.title).toBe('Spread me');
    }
  });
});
