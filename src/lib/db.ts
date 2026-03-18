import 'server-only';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@/db/schema';

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

function createSqlClient() {
  if (!validDatabaseUrl) return null;
  try {
    return neon(validDatabaseUrl);
  } catch {
    return null;
  }
}

function getDb() {
  const sqlClient = createSqlClient();
  if (!sqlClient) {
    throw new Error('DATABASE_URL is required to initialize the database client.');
  }
  return drizzle({ client: sqlClient, schema });
}

let _db: ReturnType<typeof getDb> | null = null;

export function getDatabase() {
  if (!_db) _db = getDb();
  return _db;
}

export const sql = createSqlClient();
export const db = sql ? drizzle({ client: sql, schema }) : null;
