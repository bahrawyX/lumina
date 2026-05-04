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
