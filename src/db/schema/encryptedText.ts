import { customType } from 'drizzle-orm/pg-core';
import { decryptToken, encryptToken } from '@/lib/integrations/tokenCrypto';

/**
 * A `text` column whose value is encrypted in the database and plaintext in JS.
 *
 * The alternative was calling `encryptToken` / `decryptToken` at each of the
 * eight sites that read or write a token. Two things made that the worse
 * option, and both are the kind of bug that would not surface until a user's
 * calendar broke:
 *
 *   - Missing a site fails open. An unencrypted write looks completely normal
 *     — the value round-trips, sync works, nothing logs — and the row just
 *     quietly stays in the clear.
 *   - `microsoft/token.ts` writes `rotatedRefreshToken ?? integration.refreshToken`,
 *     feeding a value it just READ back into a write. With call-site
 *     encryption that path double-encrypts, and only one of the two decrypts
 *     would unwrap it.
 *
 * Pushing it into the column removes both: values are plaintext everywhere in
 * TypeScript and ciphertext everywhere in Postgres, with no site able to opt
 * out by omission.
 *
 * The column stays `text` in SQL, so this needs no migration — only a one-time
 * backfill of rows already written in the clear
 * (`scripts/encrypt-integration-tokens.mjs`).
 *
 * Do not filter on one of these in a WHERE clause. Each encryption uses a fresh
 * random IV, so the same token produces different ciphertext every time and
 * equality never matches. Tokens are only ever looked up by user and provider,
 * which is why that is a note rather than a problem.
 */
export const encryptedText = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver(value: string): string {
    return encryptToken(value);
  },
  fromDriver(value: string): string {
    return decryptToken(value);
  },
});
