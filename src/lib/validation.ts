import { z } from 'zod';

/* ── Field schemas ────────────────────────────────────────────────────────── */

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(100, 'Name must be under 100 characters');

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Enter a valid email address');

/** Use for sign-up (stricter). */
export const passwordCreateSchema = z
  .string()
  .min(1, 'Password is required')
  .min(8, 'Password must be at least 8 characters');

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

/* ── Utility ──────────────────────────────────────────────────────────────── */

/**
 * Validates a value against a Zod schema and returns the first error message,
 * or null when the value is valid.
 */
export function getFieldError<T>(schema: z.ZodType<T>, value: unknown): string | null {
  const result = schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? 'Invalid value');
}
