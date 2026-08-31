/**
 * Encrypt OAuth tokens that were stored before encryption existed.
 *
 * `integrations.access_token` / `refresh_token` are encrypted at rest now (see
 * `src/lib/integrations/tokenCrypto.ts`), and reads tolerate legacy plaintext so
 * that deploying the change strands nobody. This converts what is already
 * there, so the plaintext stops sitting in backups and replicas.
 *
 * Reads and writes RAW column values with SQL rather than going through the
 * Drizzle model, deliberately: the model's `customType` would decrypt on read
 * and re-encrypt on write, so already-encrypted rows would be rewritten with a
 * fresh IV on every run. Doing it at the SQL level means rows already carrying
 * `v1.` are skipped, and running this twice changes nothing.
 *
 *   INTEGRATION_TOKEN_KEY=... DATABASE_URL=... node scripts/encrypt-integration-tokens.mjs
 *
 * Add --dry-run to report what would change without writing.
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { createCipheriv, randomBytes } from 'node:crypto';

const DRY_RUN = process.argv.includes('--dry-run');

if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const rawKey = process.env.INTEGRATION_TOKEN_KEY;
if (!rawKey) {
  console.error(
    'INTEGRATION_TOKEN_KEY is not set. Generate one with:\n' +
      '  node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'base64\'))"',
  );
  process.exit(1);
}

const key = Buffer.from(rawKey, 'base64');
if (key.length !== 32) {
  console.error(`INTEGRATION_TOKEN_KEY must decode to 32 bytes, got ${key.length}.`);
  process.exit(1);
}

/** Kept byte-identical to `encryptToken` in src/lib/integrations/tokenCrypto.ts. */
function encrypt(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  const { rows } = await pool.query(
    `select id, provider, access_token, refresh_token from integrations`,
  );

  let converted = 0;
  let alreadyDone = 0;

  for (const row of rows) {
    const accessIsPlain = !row.access_token.startsWith('v1.');
    const refreshIsPlain = !row.refresh_token.startsWith('v1.');

    if (!accessIsPlain && !refreshIsPlain) {
      alreadyDone += 1;
      continue;
    }

    if (!DRY_RUN) {
      await pool.query(
        `update integrations set access_token = $1, refresh_token = $2, updated_at = now() where id = $3`,
        [
          accessIsPlain ? encrypt(row.access_token) : row.access_token,
          refreshIsPlain ? encrypt(row.refresh_token) : row.refresh_token,
          row.id,
        ],
      );
    }
    converted += 1;
  }

  console.log(`integrations rows      : ${rows.length}`);
  console.log(`already encrypted      : ${alreadyDone}`);
  console.log(`${DRY_RUN ? 'would encrypt' : 'encrypted'}          : ${converted}`);
  if (DRY_RUN && converted > 0) console.log('\nDry run — nothing written. Re-run without --dry-run to apply.');
} finally {
  await pool.end();
}
