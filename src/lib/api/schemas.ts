import { z } from 'zod';
import { FIELD_LIMITS } from '@/lib/fieldLimits';

/**
 * Request shapes for the CRUD routes.
 *
 * Kept in one module rather than beside each handler, because the bug these
 * exist to prevent is two handlers disagreeing about the same object.
 * `POST /api/goals` rejected an end date before the start date and
 * `PATCH /api/goals/[id]` did not — the rule lived in a handler instead of in
 * a shape both could share.
 *
 * ## Conventions
 *
 * - **Every field on a PATCH is optional.** These are partial updates; a schema
 *   that required fields would break every caller that sends one thing.
 * - **`.nullable()` means "clearing this is meaningful"**, and is only used
 *   where the handler actually treats null as "unset" rather than "ignore".
 *   Getting that wrong silently changes behaviour, so it is per-field.
 * - **Bounds match the database.** `FIELD_LIMITS` is the same constant the
 *   older `checkFieldLengths` helper uses, so a `varchar(512)` column cannot be
 *   handed 600 characters by one path and 512 by another.
 */

const title = z.string().trim().min(1, 'Title cannot be empty').max(FIELD_LIMITS.title);
const shortTitle = z.string().trim().min(1, 'Title cannot be empty').max(FIELD_LIMITS.shortTitle);
const description = z.string().max(FIELD_LIMITS.description);

/** An ISO date-time the runtime can actually parse. */
const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Not a valid date');

/**
 * Minutes of work. Bounded at both ends.
 *
 * The manual check was `typeof x === 'number'`, so `-5` and `1e9` both passed
 * and were written straight to an `integer` column — the second overflowing it.
 */
const durationMinutes = z
  .number()
  .int('Must be a whole number of minutes')
  .min(1, 'Must be at least a minute')
  .max(24 * 60, 'Cannot exceed 24 hours');

/** `HH:mm`, matching the `varchar(5)` columns. */
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');

export const taskStatus = z.enum(['todo', 'doing', 'done']);
export const taskPriority = z.enum(['low', 'medium', 'high']);
export const taskDifficulty = z.enum(['easy', 'medium', 'hard']);

export const createTaskSchema = z.object({
  title,
  description: description.optional(),
  status: taskStatus.optional(),
  priority: taskPriority.optional(),
  difficulty: taskDifficulty.optional(),
  dueDate: isoDate.nullable().optional(),
  durationMinutes: durationMinutes.optional(),
  scheduledStart: clockTime.nullable().optional(),
  scheduledEnd: clockTime.nullable().optional(),
  /**
   * SECONDS, not minutes — `PomodoroView` sends `remainingSecs`. Left
   * non-integer on purpose: the handler rounds, as it always has, and the
   * store rounds before it ever gets here. Rejecting a fractional second
   * would break a timer that happens to tick on a float. The cap only exists
   * so a junk value cannot overflow the `integer` column.
   */
  remainingFocusTime: z.number().finite().min(0).max(100_000).nullable().optional(),
  linkedEventId: z.string().uuid().nullable().optional(),
  linkedDocId: z.string().uuid().nullable().optional(),
  parentTaskId: z.string().uuid().nullable().optional(),
  goalId: z.string().uuid().nullable().optional(),
  recurrenceRule: z.string().max(500).nullable().optional(),
  recurrenceEnd: isoDate.nullable().optional(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  /** The board sends this on a drag-reorder. */
  order: z.number().int().min(0).max(100_000).optional(),
});

export const goalTimeframe = z.enum(['weekly', 'monthly', 'quarterly', 'yearly', 'custom']);
export const goalStatus = z.enum(['active', 'completed', 'archived']);
export const goalColor = z.enum(['blue', 'green', 'purple', 'orange', 'red']);

/**
 * The ordering rule, expressed once.
 *
 * A PATCH may send only one end of the range, so this can only check what is
 * present — the handler still has to compare against the stored row for a
 * partial update. What it does guarantee is that no path accepts a range that
 * is inverted *within a single request*.
 */
const orderedRange = <T extends z.ZodRawShape>(shape: z.ZodObject<T>) =>
  shape.refine(
    (v) => {
      const record = v as { startDate?: string | null; endDate?: string | null };
      if (!record.startDate || !record.endDate) return true;
      return new Date(record.endDate) > new Date(record.startDate);
    },
    { message: 'endDate must be after startDate', path: ['endDate'] },
  );

export const goalTargetType = z.enum(['number', 'percentage', 'boolean', 'task_completion']);

/**
 * A target attached to a goal at creation time.
 *
 * The handler used to `continue` past any target whose title was blank or
 * whose type was unrecognised — so a person could add three targets, submit,
 * get a 201, and find one of them missing with nothing said about it. Same
 * shape of bug as the truncated mood note: a silent partial write.
 */
export const goalTargetSchema = z.object({
  title: shortTitle,
  description: description.nullable().optional(),
  type: goalTargetType,
  targetValue: z.number().finite().optional(),
  unit: z.string().max(32).nullable().optional(),
  linkedTaskIds: z.array(z.string().uuid()).max(200).optional(),
});

export const createGoalSchema = orderedRange(
  z.object({
    title: shortTitle,
    description: description.nullable().optional(),
    emoji: z.string().max(16).nullable().optional(),
    color: goalColor.optional(),
    timeframe: goalTimeframe.optional(),
    startDate: isoDate,
    endDate: isoDate,
    targets: z.array(goalTargetSchema).max(50).optional(),
  }),
);

export const updateGoalSchema = orderedRange(
  z.object({
    title: shortTitle.optional(),
    description: description.nullable().optional(),
    emoji: z.string().max(16).nullable().optional(),
    color: goalColor.optional(),
    status: goalStatus.optional(),
    timeframe: goalTimeframe.optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
  }),
);

export const moodValue = z.enum(['great', 'good', 'okay', 'tired', 'bad']);

export const createMoodLogSchema = z.object({
  mood: moodValue,
  // 200 matches the most permissive note input in the UI (MoodAnalysisCard).
  // The server used to accept anything and silently slice to 140, discarding
  // the tail of a reflection into an unbounded `text` column that would have
  // stored it.
  note: z.string().max(200, 'Note cannot exceed 200 characters').nullable().optional(),
  focusSessionId: z.string().uuid().nullable().optional(),
});
