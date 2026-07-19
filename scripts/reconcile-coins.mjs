/**
 * Coin ledger reconciliation — READ-ONLY monitoring check.
 *
 * Invariant (established by migration 0018): for every user,
 *   SUM(coin_transactions.amount) == users.coins
 *
 * Lists any user whose ledger sum drifts from their stored balance. Meaningful
 * only once Batch 3 routes every coin mutation through the single awardCoins()
 * helper — before that, direct balance writes will show as expected drift.
 *
 * Usage (schedule this once Batch 3 lands):
 *   RECONCILE_DATABASE_URL="postgres://…" node scripts/reconcile-coins.mjs
 *   (falls back to DATABASE_URL if RECONCILE_DATABASE_URL is unset)
 *
 * Read-only: issues only SELECTs. Exits 0 when balanced, 1 when mismatches are
 * found (so a scheduler/alert can trip on it). Point it at whichever database
 * you intend to audit — it does not choose an environment for you.
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

const url = process.env.RECONCILE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Set RECONCILE_DATABASE_URL (or DATABASE_URL) to the database to audit.');
  process.exit(2);
}

if (typeof globalThis.WebSocket === 'undefined') neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: url });

try {
  const { rows } = await pool.query(`
    SELECT u.id,
           u.coins                              AS balance,
           COALESCE(SUM(ct.amount), 0)::int     AS ledger_sum,
           u.coins - COALESCE(SUM(ct.amount), 0)::int AS drift
    FROM users u
    LEFT JOIN coin_transactions ct ON ct.user_id = u.id
    GROUP BY u.id, u.coins
    HAVING u.coins - COALESCE(SUM(ct.amount), 0) <> 0
    ORDER BY ABS(u.coins - COALESCE(SUM(ct.amount), 0)) DESC
  `);

  if (rows.length === 0) {
    console.log('OK — ledger reconciles: SUM(coin_transactions.amount) == users.coins for all users.');
    process.exitCode = 0;
  } else {
    console.error(`DRIFT — ${rows.length} user(s) whose ledger sum != balance:`);
    for (const r of rows) {
      console.error(`  user=${r.id}  balance=${r.balance}  ledger_sum=${r.ledger_sum}  drift=${r.drift}`);
    }
    process.exitCode = 1;
  }
} catch (e) {
  console.error('Reconciliation query failed:', e.message);
  process.exitCode = 2;
} finally {
  await pool.end();
}
