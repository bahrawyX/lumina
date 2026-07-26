/**
 * In-process Postgres (PGlite, WASM) for the OAuth token-refresh race tests
 * (M3 / Batch 8 #4). Nothing connects to a real database — each test spins up an
 * ephemeral instance running the SAME SQL the app runs (SELECT … FOR UPDATE inside
 * a transaction), so the regression test exercises the real lock+re-check guard.
 *
 * NOTE (TD-3): PGlite is a single in-process connection, so "concurrent"
 * Promise.all calls execute serialized. That proves the re-check logic (the
 * second caller sees the freshly-refreshed token and refreshes ZERO times) but
 * NOT true parallel row-lock contention — that needs a multi-connection Postgres
 * and is tracked in TD-3 alongside the shop/shield concurrency tests (Batch 9).
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { randomUUID } from 'node:crypto';
import * as schema from '@/db/schema';

// Focused subset of the real `integrations` schema (src/db/schema/integrations.ts).
// Enum columns are modelled as text — drizzle sends the same string values and
// the app's eq() comparisons behave identically.
const DDL = `
CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text,
  token_type text,
  last_sync_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS integrations_user_provider_unique
  ON integrations (user_id, provider);
`;

export type IntegrationsTestDb = Awaited<ReturnType<typeof makeIntegrationsTestDb>>;

export async function makeIntegrationsTestDb() {
  const client = new PGlite();
  await client.exec(DDL);
  const db = drizzle(client, { schema });
  return { db, client };
}

export async function seedIntegration(
  client: PGlite,
  opts: {
    provider: 'google' | 'microsoft' | 'outlook';
    expiresAt: Date;
    accessToken?: string;
    refreshToken?: string;
    status?: string;
    userId?: string;
  },
): Promise<string> {
  const userId = opts.userId ?? randomUUID();
  await client.query(
    `INSERT INTO integrations (user_id, provider, access_token, refresh_token, expires_at, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      userId,
      opts.provider,
      opts.accessToken ?? 'old-access',
      opts.refreshToken ?? 'refresh-0',
      opts.expiresAt.toISOString(),
      opts.status ?? 'active',
    ],
  );
  return userId;
}

export async function getIntegration(
  client: PGlite,
  userId: string,
  provider: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_at: string;
  status: string;
}> {
  const res = await client.query<{
    access_token: string;
    refresh_token: string;
    expires_at: string;
    status: string;
  }>(
    `SELECT access_token, refresh_token, expires_at, status
     FROM integrations WHERE user_id = $1 AND provider = $2`,
    [userId, provider],
  );
  return res.rows[0];
}
