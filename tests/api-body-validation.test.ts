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
