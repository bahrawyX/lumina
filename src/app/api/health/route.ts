import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/health — liveness + database reachability.
 *
 * There was no health check of any kind, which meant an uptime monitor had
 * nothing to watch and a database outage was discovered by users rather than by
 * a page. This is the endpoint an external monitor polls.
 *
 * Deliberately **unauthenticated**: a health check that needs a session cannot
 * be polled by a monitor, and it exposes nothing — a boolean, a duration, and
 * the commit sha, all of which are already public in the deployed bundle.
 *
 * Deliberately a **real query**, not `return 200`. A liveness probe that only
 * proves the lambda booted tells you nothing useful: the failure mode that
 * actually takes this app down is Neon being unreachable, and `SELECT 1` is the
 * cheapest thing that detects it.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const COMMIT =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  process.env.NEXT_PUBLIC_COMMIT_SHA?.slice(0, 7) ??
  'dev';

export async function GET() {
  const startedAt = Date.now();

  const db = getDatabase();
  if (!db) {
    logger.error('health: no database configured', { route: 'GET /api/health' });
    return NextResponse.json(
      { status: 'error', database: 'unconfigured', commit: COMMIT },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    logger.error('health: database probe failed', { route: 'GET /api/health' }, err);
    return NextResponse.json(
      {
        status: 'error',
        database: 'unreachable',
        commit: COMMIT,
        durationMs: Date.now() - startedAt,
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    {
      status: 'ok',
      database: 'ok',
      commit: COMMIT,
      durationMs: Date.now() - startedAt,
    },
    {
      status: 200,
      // Never cached: a cached health check is a health check that lies.
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  );
}
