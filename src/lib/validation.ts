import { z } from 'zod';

/* ── Field schemas ────────────────────────────────────────────────────────── */

/**
 * `.min(2)`, not `.min(1)`. A single character passed this schema and was then
 * rejected further downstream by an imperative `normalizedName.length < 2`
 * check whose message landed at page level rather than on the field — so the
 * user saw a form with no field error and a floating "Please enter your full
 * name." This schema is now the single source of truth.
 */
export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Please enter your full name')
  .max(100, 'Name must be under 100 characters');

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  // RFC 5321 caps a full address at 254 octets. Without this the field is
  // unbounded, and `.email()` alone happily accepts a megabyte of local-part.
  .max(254, 'Email must be under 254 characters')
  .email('Enter a valid email address');

/**
 * The optional reply-to on a contact submission.
 *
 * P3-2: `/api/contact` stored `body.email` with only a `typeof string` check —
 * no format validation and no length cap — while `subject` and `message` were
 * properly bounded by this same module. `emailSchema` already existed here and
 * simply was not used.
 *
 * The CR/LF strip is the part that matters beyond tidiness: this value becomes
 * the reply-to for whatever processes these submissions, and a newline in an
 * address is the first step of header injection.
 */
export const contactEmailSchema = z
  .string()
  .transform((value) => value.replace(/[\r\n]/g, '').trim())
  .pipe(emailSchema);

/**
 * Sign-up password rules. MUST stay in step with
 * `emailAndPassword.minPasswordLength` / `maxPasswordLength` in `lib/auth.ts` —
 * a client minimum below the server's produces a rejection the form cannot
 * explain, and one above it is dead code.
 *
 * 12 rather than BetterAuth's default 8: the previous effective policy accepted
 * `password1`, with no strength check and no breach check anywhere in the
 * codebase. The breach check now lives server-side (`haveIBeenPwned`).
 */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export const passwordCreateSchema = z
  .string()
  .min(1, 'Password is required')
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH, `Password must be under ${MAX_PASSWORD_LENGTH} characters`);

/** Use for sign-in (just non-empty). */
export const passwordSchema = z
  .string()
  .min(1, 'Password is required');

export const titleSchema = z
  .string()
  .trim()
  .min(1, 'Title is required')
  .max(200, 'Title must be under 200 characters');

export const contextNameSchema = z
  .string()
  .trim()
  .min(1, 'Context name is required')
  .max(50, 'Name must be under 50 characters');

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Please select a date');

/* ── Mood / Contact schemas ──────────────────────────────────────────────── */

export const moodSchema = z.enum(['great', 'good', 'okay', 'tired', 'bad']);

export const moodNoteSchema = z.string().max(140, 'Note must be under 140 characters').optional();

export const contactTypeSchema = z.enum(['suggestion', 'technical', 'feedback']);

export const contactSubjectSchema = z
  .string()
  .trim()
  .min(1, 'Subject is required')
  .max(100, 'Subject must be under 100 characters');

export const contactMessageSchema = z
  .string()
  .trim()
  .min(10, 'Message must be at least 10 characters')
  .max(1000, 'Message must be under 1000 characters');

/* ── Utility ──────────────────────────────────────────────────────────────── */

/**
 * Validates a value against a Zod schema and returns the first error message,
 * or null when the value is valid.
 */
export function getFieldError<T>(schema: z.ZodType<T>, value: unknown): string | null {
  const result = schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? 'Invalid value');
}
