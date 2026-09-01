/**
 * OAuth tokens are encrypted in the database and plaintext in TypeScript.
 *
 * `integrations.access_token` / `refresh_token` held Google and Microsoft
 * calendar credentials as bare `text`. Access tokens expire in an hour, but
 * refresh tokens are long-lived and Google's do not rotate — so a copy of the
 * table was durable, renewable read access to every connected user's calendar.
 *
 * The encryption lives in the COLUMN (`customType`), not at the call sites, so
 * these tests care about one property above all: a value written through the
 * Drizzle model must be unreadable in the raw column and identical when read
 * back through the model. The helpers make that directly observable —
 * `seedIntegration` and `getIntegration` both use `client.query`, bypassing
 * Drizzle entirely, so they see exactly what Postgres holds.
 *
 * The end-to-end block runs the SAME assertions twice, with and without a key
 * configured, and expects OPPOSITE outcomes. Without that pairing, a suite
 * where encryption silently did nothing would still be fully green: every
 * round-trip would pass, because plaintext round-trips perfectly.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { integrations } from '@/db/schema';
import {
  makeIntegrationsTestDb,
  seedIntegration,
  getIntegration,
  type IntegrationsTestDb,
} from './helpers/integrationsTestDb';
import {
  encryptToken,
  decryptToken,
  isEncrypted,
  resetTokenCryptoCache,
} from '@/lib/integrations/tokenCrypto';

const KEY_A = randomBytes(32).toString('base64');
const KEY_B = randomBytes(32).toString('base64');

/** The cache is module-level, so every key change has to invalidate it. */
function useKey(key: string | undefined) {
  if (key === undefined) delete process.env.INTEGRATION_TOKEN_KEY;
  else process.env.INTEGRATION_TOKEN_KEY = key;
  resetTokenCryptoCache();
}

const originalKey = process.env.INTEGRATION_TOKEN_KEY;
afterEach(() => {
  useKey(originalKey);
});

describe('encryptToken / decryptToken', () => {
  beforeEach(() => useKey(KEY_A));

  it('round-trips a token', () => {
    const token = 'ya29.a0AfB_by-REAL-LOOKING-GOOGLE-TOKEN';
    expect(decryptToken(encryptToken(token))).toBe(token);
  });

  it('does not leave the plaintext anywhere in the stored value', () => {
    // The whole point. A format that merely wrapped the token would pass a
    // round-trip test and protect nothing.
    const token = 'ya29.super-secret-value';
    const stored = encryptToken(token);
    expect(stored).not.toContain(token);
    expect(stored).not.toContain('super-secret-value');
    expect(isEncrypted(stored)).toBe(true);
  });

  it('produces different ciphertext each time, from the random IV', () => {
    const a = encryptToken('same-token');
    const b = encryptToken('same-token');
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe('same-token');
    expect(decryptToken(b)).toBe('same-token');
  });

  it('refuses to decrypt a tampered value', () => {
    // GCM's auth tag is the reason to prefer it over CBC here: altering the
    // ciphertext must fail loudly rather than yield a different token.
    const stored = encryptToken('ya29.original');
    const parts = stored.split('.');
    const bytes = Buffer.from(parts[3], 'base64url');
    bytes[0] ^= 0xff;
    parts[3] = bytes.toString('base64url');

    expect(() => decryptToken(parts.join('.'))).toThrow(/Could not decrypt/);
  });

  it('refuses to decrypt with the wrong key', () => {
    const stored = encryptToken('ya29.original');
    useKey(KEY_B);
    expect(() => decryptToken(stored)).toThrow(/Could not decrypt/);
  });

  it('rejects a key that is not 32 bytes', () => {
    // A truncated paste would otherwise write tokens nothing could read back.
    useKey(randomBytes(16).toString('base64'));
    expect(() => encryptToken('x')).toThrow(/must be 32 bytes/);
  });

  it('treats re-encryption as a no-op', () => {
    // `microsoft/token.ts` writes back a value it just read. Nesting would make
    // one unwrap insufficient.
    const once = encryptToken('ya29.original');
    expect(encryptToken(once)).toBe(once);
    expect(decryptToken(encryptToken(once))).toBe('ya29.original');
  });

  describe('legacy plaintext', () => {
    it('passes through decrypt unchanged', () => {
      // Rows written before this existed must keep working, or deploying the
      // change disconnects every calendar at once.
      expect(decryptToken('ya29.legacy-plaintext')).toBe('ya29.legacy-plaintext');
      expect(isEncrypted('ya29.legacy-plaintext')).toBe(false);
    });
  });

  describe('with no key configured', () => {
    beforeEach(() => useKey(undefined));

    it('stores plaintext rather than failing the OAuth callback', () => {
      // Fail-open on WRITE is deliberate: this sits in the token-refresh path,
      // and throwing would take calendar sync down for everyone to defend
      // against a threat that already requires database access.
      expect(encryptToken('ya29.token')).toBe('ya29.token');
    });

    it('throws when asked to read something encrypted', () => {
      // Fail-open on READ is not acceptable: handing back ciphertext would
      // surface as a puzzling 401 from Google instead of a config error.
      useKey(KEY_A);
      const stored = encryptToken('ya29.token');
      useKey(undefined);
      expect(() => decryptToken(stored)).toThrow(/INTEGRATION_TOKEN_KEY is not set/);
    });
  });
});

describe('the column encrypts on the way to Postgres', () => {
  let db: IntegrationsTestDb['db'];
  let client: IntegrationsTestDb['client'];

  beforeEach(async () => {
    const t = await makeIntegrationsTestDb();
    db = t.db;
    client = t.client;
  });

  /**
   * Writes a row through Drizzle, then reads the raw column with SQL.
   * Returns both what Postgres holds and what the model gives back.
   */
  async function writeThenRead(token: string) {
    const userId = randomUUID();
    await db.insert(integrations).values({
      userId,
      provider: 'google',
      accessToken: token,
      refreshToken: `${token}-refresh`,
      expiresAt: new Date(Date.now() + 3_600_000),
      status: 'active',
    });

    const raw = await getIntegration(client, userId, 'google');
    const [viaModel] = await db
      .select()
      .from(integrations)
      .where(and(eq(integrations.userId, userId), eq(integrations.provider, 'google')))
      .limit(1);

    return { raw, viaModel };
  }

  it('stores ciphertext and returns plaintext', async () => {
    useKey(KEY_A);
    const token = 'ya29.a0AfB_by-SENSITIVE';
    const { raw, viaModel } = await writeThenRead(token);

    expect(raw.access_token).not.toContain(token);
    expect(raw.refresh_token).not.toContain(token);
    expect(isEncrypted(raw.access_token)).toBe(true);
    expect(isEncrypted(raw.refresh_token)).toBe(true);

    expect(viaModel.accessToken).toBe(token);
    expect(viaModel.refreshToken).toBe(`${token}-refresh`);
  });

  it('NEGATIVE CONTROL: without a key the very same assertions fail', async () => {
    // Proves the test above is detecting encryption rather than passing
    // vacuously. Plaintext round-trips perfectly, so the model assertions still
    // hold here — only the storage assertions flip. If this block ever starts
    // reporting ciphertext, the one above has stopped meaning anything.
    useKey(undefined);
    const token = 'ya29.a0AfB_by-SENSITIVE';
    const { raw, viaModel } = await writeThenRead(token);

    expect(raw.access_token).toBe(token);
    expect(isEncrypted(raw.access_token)).toBe(false);
    expect(viaModel.accessToken).toBe(token);
  });

  it('reads a legacy plaintext row written before encryption existed', async () => {
    useKey(KEY_A);
    // seedIntegration inserts with raw SQL, so this row is genuinely plaintext
    // in the way pre-existing production rows are.
    const userId = await seedIntegration(client, {
      provider: 'google',
      expiresAt: new Date(Date.now() + 3_600_000),
      accessToken: 'legacy-access-token',
      refreshToken: 'legacy-refresh-token',
    });

    const [row] = await db
      .select()
      .from(integrations)
      .where(and(eq(integrations.userId, userId), eq(integrations.provider, 'google')))
      .limit(1);

    expect(row.accessToken).toBe('legacy-access-token');
    expect(row.refreshToken).toBe('legacy-refresh-token');
  });

  it('encrypts a legacy row once it is updated', async () => {
    // How rows migrate without a backfill: the next token refresh rewrites
    // them. The backfill script exists because Google's refresh token never
    // rotates, so some rows would otherwise stay plaintext indefinitely.
    useKey(KEY_A);
    const userId = await seedIntegration(client, {
      provider: 'google',
      expiresAt: new Date(Date.now() + 3_600_000),
      accessToken: 'legacy-access-token',
      refreshToken: 'legacy-refresh-token',
    });

    await db
      .update(integrations)
      .set({ accessToken: 'rotated-access-token' })
      .where(and(eq(integrations.userId, userId), eq(integrations.provider, 'google')));

    const raw = await getIntegration(client, userId, 'google');
    expect(isEncrypted(raw.access_token)).toBe(true);
    expect(raw.access_token).not.toContain('rotated-access-token');
    // Untouched by the UPDATE, so still legacy — and still readable.
    expect(isEncrypted(raw.refresh_token)).toBe(false);
  });
});

describe('the backfill script writes the format the app reads', () => {
  it('uses the same algorithm, IV size and version as tokenCrypto', async () => {
    /**
     * `scripts/encrypt-integration-tokens.mjs` reimplements `encryptToken`
     * rather than importing it — the script is plain `.mjs` run by node with no
     * bundler, and the module lives behind the `@/` alias.
     *
     * That duplication is the risk this covers. Changing the format in
     * tokenCrypto (a v2, a different cipher, a 16-byte IV) without changing the
     * script would leave the script writing tokens that look perfectly fine in
     * the database and throw at runtime — and only for the rows the backfill
     * touched, so it would surface as a handful of users mysteriously losing
     * their calendar rather than as an obvious break.
     *
     * Verified end to end against a disposable Postgres: the script encrypted
     * two seeded rows and the app's real `decryptToken` read back the exact
     * originals. This guard is what keeps that true.
     */
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const script = readFileSync(join(process.cwd(), 'scripts/encrypt-integration-tokens.mjs'), 'utf8');
    const lib = readFileSync(join(process.cwd(), 'src/lib/integrations/tokenCrypto.ts'), 'utf8');

    // The cipher, the 12-byte IV, and the version prefix all have to agree.
    expect(script).toContain("'aes-256-gcm'");
    expect(lib).toContain("'aes-256-gcm'");
    expect(script).toContain('randomBytes(12)');
    expect(lib).toContain('IV_BYTES = 12');
    expect(script).toContain("'v1',");
    expect(lib).toContain("VERSION = 'v1'");

    // And the segment order, which a round-trip against one implementation
    // alone would never catch.
    expect(script).toMatch(/iv\.toString\('base64url'\),\s*tag\.toString\('base64url'\),\s*ciphertext\.toString\('base64url'\)/);
  });
});

describe('the schema wires both token columns through the encrypted type', () => {
  it('uses encryptedText, not text', async () => {
    // A structural guard: reverting either column to `text()` would silently
    // store plaintext again, and every behavioural test above would still pass
    // for the column that was left alone.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/db/schema/integrations.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    expect(src).toMatch(/accessToken:\s*encryptedText\('access_token'\)/);
    expect(src).toMatch(/refreshToken:\s*encryptedText\('refresh_token'\)/);
    expect(src).not.toMatch(/accessToken:\s*text\(/);
    expect(src).not.toMatch(/refreshToken:\s*text\(/);
  });
});
