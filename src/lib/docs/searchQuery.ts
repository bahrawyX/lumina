/**
 * Build a `to_tsquery` argument from raw user input.
 *
 * P2-11: `/api/docs/search` did this:
 *
 *     to_tsquery('english', ${q.replace(/\s+/g, ':* & ') + ':*'})
 *
 * The value is bound as a parameter, so there was never SQL injection — but
 * `to_tsquery` parses its *argument* as query syntax. Verified against a real
 * Postgres, these all raised `syntax error in tsquery` and surfaced as a 500:
 *
 *     "why?!"      -> syntax error in tsquery: "why?!:*"
 *     "foo & bar"  -> syntax error in tsquery: "foo:* & &:* & bar:*"
 *     "a:b"        -> syntax error in tsquery: "a:b:*"
 *     "(x)"        -> syntax error in tsquery: "(x):*"
 *     "!"          -> syntax error in tsquery: "!:*"
 *
 * Since the box searches as you type, a user typing `why?!` got a 500 in the
 * middle of a word.
 *
 * The audit's suggested fix was `websearch_to_tsquery`, which never raises. It
 * is the right function for a search BUTTON and the wrong one here: it cannot
 * emit a prefix match, so `quar` would stop matching `quarterly` and
 * search-as-you-type would break for every partially typed word. It also reads
 * a leading `-` as NOT, so `a<->b` becomes `!'b'` — a query that excludes what
 * the user typed.
 *
 * So: strip every `to_tsquery` operator from the input first, then build the
 * prefix query from what is left. Nothing that survives can be operator syntax,
 * which is what makes it total.
 */

/** Characters `to_tsquery` treats as syntax rather than text. */
const TSQUERY_OPERATORS = /[!&|()<>:*'"\\]/g;

/** Enough terms for a real query; a pasted paragraph is not one. */
const MAX_TERMS = 8;

/** Postgres truncates lexemes at 2046 bytes; stop far short of it. */
const MAX_TERM_LENGTH = 64;

/**
 * Returns the `to_tsquery` argument, or null when the input has no searchable
 * term left — in which case the caller should return an empty result rather
 * than run a query that cannot match.
 */
export function buildDocsPrefixQuery(raw: string): string | null {
  const terms = raw
    .replace(TSQUERY_OPERATORS, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TERMS)
    .map((term) => term.slice(0, MAX_TERM_LENGTH));

  if (terms.length === 0) return null;

  return terms.map((term) => `${term}:*`).join(' & ');
}
