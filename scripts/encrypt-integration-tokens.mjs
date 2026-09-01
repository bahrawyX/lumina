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
 * ## Usage
 *
 * Put `INTEGRATION_TOKEN_KEY` and `DATABASE_URL` in `.env.local` — where the
 * app needs the key anyway — and run:
 *
 *     node scripts/encrypt-integration-tokens.mjs --dry-run    # report only
 *     node scripts/encrypt-integration-tokens.mjs              # apply
 *
 * Config is read from `.env.local` first, then `.env`, matching the precedence
 * Next.js uses. Real environment variables still win over both, so a one-off
 * override works — though note that `VAR=value cmd` is bash syntax and does
 * nothing in PowerShell, where it is `$env:VAR = 'value'` on its own line
 * first. Reading the env files avoids that difference entirely, which is why
 * this does not ask for anything on the command line.
 */
import { config } from 'dotenv';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { createCipheriv, randomBytes } from 'node:crypto';

// Earlier files win: dotenv does not overwrite a key it has already seen, and
// never overwrites a real environment variable.
config({ path: ['.env.local', '.env'], quiet: true });

const DRY_RUN = process.argv.includes('--dry-run');

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  fail('DATABASE_URL is not set. Add it to .env.local.');
}

const rawKey = process.env.INTEGRATION_TOKEN_KEY;
if (!rawKey) {
  fail(
    'INTEGRATION_TOKEN_KEY is not set. Add it to .env.local.\n\n' +
      'Generate one with:\n' +
      '  node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'base64\'))"\n\n' +
      'Use the SAME key the app runs with, or it will not be able to read what this writes.',
  );
}

const key = Buffer.from(rawKey, 'base64');
if (key.length !== 32) {
  fail(
    `INTEGRATION_TOKEN_KEY must decode to 32 bytes, got ${key.length}. ` +
      'It should be the full base64 string, quotes and all trailing "=" included.',
  );
}

if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

/**
 * Mirrors `src/lib/db.ts`: against a local Postgres the Neon driver speaks its
 * own WebSocket protocol, so it needs `wsproxy` in front. Without this the
 * script only ever works against a real Neon instance, which would leave it
 * untestable anywhere but production.
 */
function isLocalHost(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

const wsProxyAddress =
  process.env.NEON_WS_PROXY?.trim() ||
  (isLocalHost(databaseUrl) ? `localhost:${process.env.NEON_WS_PROXY_PORT ?? '5433'}` : null);

if (wsProxyAddress) {
  neonConfig.wsProxy = (host, port) => `${wsProxyAddress}/v1?address=${host}:${port}`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

/** Kept byte-identical to `encryptToken` in src/lib/integrations/tokenCrypto.ts. */
function encrypt(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
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

  console.log(`integrations rows : ${rows.length}`);
  console.log(`already encrypted : ${alreadyDone}`);
  console.log(`${DRY_RUN ? 'would encrypt' : 'encrypted'}     : ${converted}`);
  if (DRY_RUN && converted > 0) {
    console.log('\nDry run — nothing written. Re-run without --dry-run to apply.');
  }
} catch (err) {
  if (err?.message?.includes('relation "integrations" does not exist')) {
    fail('No `integrations` table in this database. Is DATABASE_URL pointing where you expect?');
  }
  throw err;
} finally {
  await pool.end();
}
