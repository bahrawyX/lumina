import 'server-only';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from '@/db/schema';

// drizzle-orm/neon-serverless uses the Pool/WebSocket driver, which is the
// only Neon driver that supports `db.transaction()`. Without this, every
// route that wraps multiple inserts in a transaction (goals POST, awardCoins,
// shop/purchase, focus-sessions, events/[id], events/create-linked, link)
// throws "No transactions support in neon-http driver" and 500s.
//
// The Pool driver speaks WebSocket. Node ≥22 has a global WebSocket; on
// older runtimes (and to keep behavior consistent across Vercel functions
// that may run on Node 20) we hand it the `ws` package's constructor.
if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

const databaseUrl = process.env.DATABASE_URL;

/**
 * Point the Neon driver at a plain Postgres, for local development and CI.
 *
 * The serverless driver speaks Neon's WebSocket protocol, not the raw Postgres
 * wire protocol — so with a `localhost` connection string every query fails
 * with an opaque `ErrorEvent`. In practice the app could only ever run against
 * a real Neon instance, which is why the sixteen Playwright specs in
 * `tests/e2e` had never run anywhere: there was no database they were allowed
 * to talk to.
 *
 * Neon publish `wsproxy` for exactly this. Pointing the driver at it keeps
 * production on the identical code path — same driver, same pool, same
 * transaction semantics — while a disposable Postgres stands in underneath.
 *
 * `NEON_WS_PROXY` is the proxy's address as seen by THIS process
 * (e.g. `localhost:5433`), which is deliberately separate from the hostname in
 * `DATABASE_URL`. Those differ whenever the proxy and the database are
 * containers talking to each other over a docker network while the app runs on
 * the host: the app dials the published proxy port, and the proxy dials the
 * database by its container name.
 *
 * Keyed on an explicit variable rather than `NODE_ENV`, because an e2e run uses
 * a production build against a local database — the exact case that needs this,
 * and the one `NODE_ENV` would misreport. A deployment that never sets the
 * variable is untouched.
 */
const wsProxyAddress =
  process.env.NEON_WS_PROXY?.trim() ||
  (isLocalHost(databaseUrl) ? `localhost:${process.env.NEON_WS_PROXY_PORT ?? '5433'}` : null);

function isLocalHost(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

if (wsProxyAddress) {
  // `?address=` is how wsproxy learns which database to dial. Dropping it
  // leaves the proxy connecting to a bare `:5432` — reachable, and refused.
  neonConfig.wsProxy = (host, port) => `${wsProxyAddress}/v1?address=${host}:${port}`;
  // No TLS in front of a local proxy. Leaving it on makes the handshake hang
  // rather than fail, which is a far worse thing to debug.
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

function hasValidDatabaseUrl(value: string | undefined): value is string {
  if (!value) return false;
  // Guard against placeholder strings copied into env files.
  if (value.includes('<') || value.includes('>')) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol.length > 0 && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

const validDatabaseUrl = hasValidDatabaseUrl(databaseUrl) ? databaseUrl : null;

function createPool() {
  if (!validDatabaseUrl) return null;
  try {
    return new Pool({ connectionString: validDatabaseUrl });
  } catch {
    return null;
  }
}

let _pool: Pool | null = null;
function getPool() {
  if (!_pool) _pool = createPool();
  return _pool;
}

function getDb() {
  const pool = getPool();
  if (!pool) {
    throw new Error('DATABASE_URL is required to initialize the database client.');
  }
  return drizzle({ client: pool, schema });
}

let _db: ReturnType<typeof getDb> | null = null;

export function getDatabase() {
  if (!_db) _db = getDb();
  return _db;
}

const initialPool = getPool();
export const db = initialPool ? drizzle({ client: initialPool, schema }) : null;
