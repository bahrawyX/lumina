/**
 * The Gemini model, in one place and overridable without a deploy.
 *
 * ## Why this exists
 *
 * `'gemini-2.0-flash'` was hardcoded in four route files. Google retired it,
 * and every AI feature in the app started failing at once with:
 *
 *     404 This model models/gemini-2.0-flash is no longer available.
 *     Please update your code to use models/gemini-3.6-flash
 *
 * That is four separate outages from one upstream change — the daily brief's
 * narrative, the docs AI stream, goal task suggestions, and natural-language
 * event parsing — each failing in its own way because each route handles the
 * error differently.
 *
 * Two things follow from that, and both are done here rather than by editing
 * the string in four places:
 *
 * 1. **One definition.** A model deprecation is now a one-line change.
 * 2. **An environment override.** `GEMINI_MODEL` lets the next retirement be
 *    fixed by setting a variable, without waiting on a deploy. Model names are
 *    upstream data on someone else's schedule, so they belong in configuration
 *    rather than in source.
 *
 * The default tracks whatever Google's own deprecation notice names as the
 * replacement.
 *
 * Deliberately NOT `server-only`: a model name is not a secret, and the guard
 * would buy nothing while forcing every test that transitively imports a
 * Gemini route into the server-only project. `logger.ts` had its guard removed
 * for the same reason. `GEMINI_API_KEY` beside it stays server-side, because
 * that genuinely is one.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash';
