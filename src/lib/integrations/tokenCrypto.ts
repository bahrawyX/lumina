/**
 * Encryption at rest for stored OAuth tokens.
 *
 * `integrations.access_token` and `integrations.refresh_token` held Google and
 * Microsoft calendar credentials as bare `text`. Access tokens expire in an
 * hour, but REFRESH tokens are long-lived and Google's do not rotate — so a
 * copy of the table was durable read access to every connected user's calendar,
 * renewable indefinitely, with nothing in the app's own logs to show for it.
 * A database dump, a stray backup, a read-replica credential, or a support
 * query pasted into the wrong window all had the same blast radius.
 *
 * AES-256-GCM, random 96-bit IV per encryption, authentication tag stored
 * alongside. GCM rather than CBC because the tag makes tampering a decryption
 * failure instead of a silently altered token.
 *
 * ## Stored format
 *
 *     v1.<iv>.<tag>.<ciphertext>        all three base64url
 *
 * Versioned so a future key rotation or algorithm change can be told apart from
 * v1 on sight, rather than guessed at from length.
 *
 * ## Reading legacy plaintext
 *
 * `decryptToken` returns anything without the `v1.` prefix unchanged. Rows
 * written before this existed keep working, so deploying this does not strand
 * anybody's calendar connection. `scripts/encrypt-integration-tokens.mjs`
 * converts them in one pass; until it runs, both forms coexist safely.
 *
 * ## When no key is configured
 *
 * `encryptToken` returns its input unchanged and logs once. This is deliberately
 * fail-open: this module sits directly in the OAuth callback and token-refresh
 * paths, so throwing on a missing key would take calendar sync down for every
 * user the moment it deployed, to protect against a threat that requires
 * database access in the first place. Unset means "exactly as insecure as
 * yesterday", not "broken today".
 *
 * The reverse is NOT fail-open: a `v1.` value with no key throws. Silently
 * handing a caller ciphertext as if it were a token would surface as a confusing
 * 401 from Google rather than as the configuration error it is.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96 bits, the size GCM is specified for
const KEY_BYTES = 32; // AES-256

/** Set once so a misconfigured deploy logs a line per process, not per token. */
let warnedAboutMissingKey = false;

/**
 * Cached across calls because this is on the hot path of every calendar read.
 * `undefined` = not yet looked up, `null` = looked up and absent.
 */
let cachedKey: Buffer | null | undefined;

function getKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;

  const raw = process.env.INTEGRATION_TOKEN_KEY;
  if (!raw) {
    cachedKey = null;
    return null;
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    // Worth throwing: a key of the wrong length is a typo or a truncated paste,
    // and carrying on would write tokens nothing could decrypt later.
    throw new Error(
      `[tokenCrypto] INTEGRATION_TOKEN_KEY must be ${KEY_BYTES} bytes base64-encoded, got ${key.length}. ` +
        `Generate one with: node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`,
    );
  }

  cachedKey = key;
  return key;
}

/** Only for tests, which need to set a key after this module has been imported. */
export function resetTokenCryptoCache(): void {
  cachedKey = undefined;
  warnedAboutMissingKey = false;
}

/** True when `value` is in the stored encrypted format rather than legacy plaintext. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}.`);
}

export function encryptToken(plaintext: string): string {
  const key = getKey();

  if (!key) {
    if (!warnedAboutMissingKey) {
      warnedAboutMissingKey = true;
      console.error(
        '[tokenCrypto] INTEGRATION_TOKEN_KEY is not set — OAuth tokens are being stored in PLAINTEXT. ' +
          'Generate a key with: node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'base64\'))"',
      );
    }
    return plaintext;
  }

  // Already-encrypted input would mean a caller encrypted twice; returning it
  // untouched keeps that a no-op rather than a nested blob only one of the two
  // decrypt calls could unwrap.
  if (isEncrypted(plaintext)) return plaintext;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptToken(stored: string): string {
  // Legacy plaintext, written before this module existed. Pass it through so a
  // deploy does not strand existing connections.
  if (!isEncrypted(stored)) return stored;

  const key = getKey();
  if (!key) {
    throw new Error(
      '[tokenCrypto] Stored token is encrypted but INTEGRATION_TOKEN_KEY is not set. ' +
        'The key that wrote these tokens must be restored to read them.',
    );
  }

  const parts = stored.split('.');
  if (parts.length !== 4) {
    throw new Error(`[tokenCrypto] Malformed encrypted token: expected 4 segments, got ${parts.length}`);
  }

  const [, ivPart, tagPart, ciphertextPart] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // GCM's tag check failed: wrong key, or the stored bytes were altered.
    // Deliberately does not echo the value — this runs in request paths whose
    // errors reach logs.
    throw new Error(
      '[tokenCrypto] Could not decrypt stored token — the key may have changed. ' +
        'Affected users must reconnect their calendar.',
    );
  }
}
