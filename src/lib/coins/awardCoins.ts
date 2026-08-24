import { getDatabase } from '@/lib/db';
import { users, coinTransactions, dailyRewardCaps } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import type { AwardEntry } from '@/lib/coins/dedupeKeys';

/**
 * ─── THE SINGLE COIN PATH ───────────────────────────────────────────────────
 * Every coin mutation in the app goes through `awardCoins` / `awardFocusCoins`.
 * Nothing else may write `users.coins` (enforced by grep in CI review). Each
 * ledger row carries a mandatory `dedupeKey`; a replay attempts a duplicate
 * insert → unique violation → no coins. Spends are guarded so the balance can
 * never go negative. All arithmetic happens in SQL — never read-in-JS-write.
 *
 * ─── CANONICAL LOCK ORDER (must hold across the whole codebase) ─────────────
 *        daily_reward_caps   →   users
 * Any transaction touching BOTH tables acquires the `daily_reward_caps` row
 * lock (SELECT … FOR UPDATE) FIRST, then updates `users`. `awardFocusCoins`
 * follows this; the shop spend path takes only the `users` lock (compatible).
 * A call site that locks `users` before a cap row would deadlock — never add one.
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * Thrown when a concurrent tx wins the dedupe insert, forcing this tx to roll
 * back. Exported so callers composing their own transaction (e.g. shop) can map
 * the race to a domain response (409) instead of a 500.
 */
export class DuplicateAwardRace extends Error {}

export interface AwardOutcome {
  dedupeKey: string;
  awarded: boolean;
  skipped?: 'duplicate' | 'insufficient_funds';
}

export interface AwardResult {
  /** User's coin balance after applying the batch. */
  newBalance: number;
  /** Net coins actually applied (duplicates / rejected spends excluded). */
  applied: number;
  outcomes: AwardOutcome[];
}

type Executor = { select: ReturnType<typeof getDatabase>['select'] };

async function currentBalance(exec: Executor, userId: string): Promise<number> {
  const [u] = await exec.select({ coins: users.coins }).from(users).where(eq(users.id, userId));
  return u?.coins ?? 0;
}

type Tx = Parameters<Parameters<ReturnType<typeof getDatabase>['transaction']>[0]>[0];

export type CoinDeltaOutcome =
  | { status: 'ok'; balanceAfter: number }
  | { status: 'insufficient_funds'; balanceAfter: number }
  | { status: 'duplicate'; balanceAfter: number };

/**
 * tx-scoped guarded balance change + single ledger insert:
 *   1. dedupe pre-check (common replay path — no balance touch)
 *   2. adjust balance in SQL, guarded `coins + amount >= 0` for spends
 *   3. insert the ledger row ONCE with its final amount + balance_after
 * Callers that must atomically compose extra writes (e.g. shop inventory grants)
 * run this inside their OWN transaction. Throws DuplicateAwardRace on a
 * concurrent dedupe race so that transaction rolls back. Never inserts-then-
 * amends → SUM(ledger)==coins holds at every commit.
 */
export async function applyCoinDelta(tx: Tx, userId: string, e: AwardEntry): Promise<CoinDeltaOutcome> {
  const [existing] = await tx
    .select({ id: coinTransactions.id })
    .from(coinTransactions)
    .where(and(eq(coinTransactions.userId, userId), eq(coinTransactions.dedupeKey, e.dedupeKey)))
    .limit(1);
  if (existing) return { status: 'duplicate', balanceAfter: await currentBalance(tx, userId) };

  const [updated] = await tx
    .update(users)
    .set({ coins: sql`${users.coins} + ${e.amount}`, updatedAt: new Date() })
    .where(
      e.amount < 0
        ? and(eq(users.id, userId), sql`${users.coins} + ${e.amount} >= 0`)
        : eq(users.id, userId),
    )
    .returning({ coins: users.coins });
  if (!updated) return { status: 'insufficient_funds', balanceAfter: await currentBalance(tx, userId) };

  const inserted = await tx
    .insert(coinTransactions)
    .values({
      userId,
      amount: e.amount,
      reason: e.reason,
      label: e.label,
      dedupeKey: e.dedupeKey,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      balanceAfter: updated.coins,
      metadata: e.metadata ?? {},
    })
    .onConflictDoNothing({
      target: [coinTransactions.userId, coinTransactions.dedupeKey],
      where: sql`${coinTransactions.dedupeKey} is not null`,
    })
    .returning({ id: coinTransactions.id });
  if (inserted.length === 0) throw new DuplicateAwardRace();

  return { status: 'ok', balanceAfter: updated.coins };
}

/** Apply one keyed entry in its own transaction (wraps applyCoinDelta). */
async function awardOne(
  db: ReturnType<typeof getDatabase>,
  userId: string,
  e: AwardEntry,
): Promise<{ outcome: AwardOutcome; balance: number; applied: number }> {
  try {
    const res = await db.transaction((tx) => applyCoinDelta(tx, userId, e));
    if (res.status === 'ok') {
      return { outcome: { dedupeKey: e.dedupeKey, awarded: true }, balance: res.balanceAfter, applied: e.amount };
    }
    return {
      outcome: { dedupeKey: e.dedupeKey, awarded: false, skipped: res.status },
      balance: res.balanceAfter,
      applied: 0,
    };
  } catch (err) {
    if (err instanceof DuplicateAwardRace) {
      return {
        outcome: { dedupeKey: e.dedupeKey, awarded: false, skipped: 'duplicate' },
        balance: await currentBalance(db, userId),
        applied: 0,
      };
    }
    throw err;
  }
}

/**
 * Award (or spend) a batch of keyed coin entries. Each entry is independently
 * idempotent and atomic; a duplicate or rejected spend is skipped, not fatal.
 */
export async function awardCoins(userId: string, entries: AwardEntry[]): Promise<AwardResult> {
  const db = getDatabase();
  if (entries.length === 0) {
    return { newBalance: await currentBalance(db, userId), applied: 0, outcomes: [] };
  }
  let balance = 0;
  let applied = 0;
  const outcomes: AwardOutcome[] = [];
  for (const e of entries) {
    const r = await awardOne(db, userId, e);
    outcomes.push(r.outcome);
    balance = r.balance;
    applied += r.applied;
  }
  return { newBalance: balance, applied, outcomes };
}

export interface FocusAwardArgs {
  sessionId: string;
  /** UTC 'YYYY-MM-DD' cap bucket, derived by the caller (never a raw now()::date). */
  utcDate: string;
  /** Server-bounded session minutes (already passed through rewardedSessionMinutes). */
  requestedMinutes: number;
  /** Per-day ceiling on rewarded focus minutes (MAX_DAILY_FOCUS_MINUTES). */
  maxDailyMinutes: number;
  /**
   * Per-day ceiling on how many sessions may earn coins
   * (MAX_DAILY_FOCUS_SESSIONS).
   *
   * P1-3: the minute cap alone cannot bound a reward that does not scale with
   * minutes. `focusSessionAwards` returns a FLAT base of 5 whatever the
   * duration, so 720 one-minute sessions collected 720 x 5 = 3,600 flat coins
   * inside the same 720-minute budget an honest single session spends on 5.
   */
  maxDailySessions: number;
  /** Coins earned for the granted (post-cap) minutes — the full focus reward formula. */
  coinsForMinutes: (grantedMinutes: number) => number;
  label?: string;
}

/**
 * Award focus-session coins bounded by the per-day minute cap. Resolves granted
 * minutes against `daily_reward_caps` under a FOR UPDATE lock (caps → users
 * order), then awards `coinsForMinutes(granted)` as a single session-keyed
 * ledger row. Idempotent per session; grants nothing once the daily cap is hit.
 */
export async function awardFocusCoins(
  userId: string,
  args: FocusAwardArgs,
): Promise<{ grantedMinutes: number; newBalance: number; awarded: boolean }> {
  const db = getDatabase();
  const dedupeKey = `focus_session:${args.sessionId}`;
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: coinTransactions.id })
        .from(coinTransactions)
        .where(and(eq(coinTransactions.userId, userId), eq(coinTransactions.dedupeKey, dedupeKey)))
        .limit(1);
      if (existing) {
        return { grantedMinutes: 0, newBalance: await currentBalance(tx, userId), awarded: false };
      }

      // LOCK ORDER: daily_reward_caps FIRST. Ensure the row exists, then lock it.
      await tx
        .insert(dailyRewardCaps)
        .values({ userId, reason: 'focus', bucketDate: args.utcDate, usedUnits: 0 })
        .onConflictDoNothing({
          target: [dailyRewardCaps.userId, dailyRewardCaps.reason, dailyRewardCaps.bucketDate],
        });
      const [cap] = await tx
        .select({ used: dailyRewardCaps.usedUnits })
        .from(dailyRewardCaps)
        .where(
          and(
            eq(dailyRewardCaps.userId, userId),
            eq(dailyRewardCaps.reason, 'focus'),
            eq(dailyRewardCaps.bucketDate, args.utcDate),
          ),
        )
        .for('update');
      const used = cap?.used ?? 0;
      const granted = Math.max(0, Math.min(args.requestedMinutes, args.maxDailyMinutes - used));
      if (granted <= 0) {
        return { grantedMinutes: 0, newBalance: await currentBalance(tx, userId), awarded: false };
      }

      // ── Session-count cap (P1-3) ─────────────────────────────────────────
      // A second bucket in the same table, keyed 'focus_sessions', counting
      // rewarded sessions rather than minutes. Claimed inside the SAME
      // transaction and after the minute cap, preserving the documented lock
      // order (daily_reward_caps -> users) — taking it in a separate
      // transaction would open a deadlock window against concurrent awards.
      await tx
        .insert(dailyRewardCaps)
        .values({ userId, reason: 'focus_sessions', bucketDate: args.utcDate, usedUnits: 0 })
        .onConflictDoNothing({
          target: [dailyRewardCaps.userId, dailyRewardCaps.reason, dailyRewardCaps.bucketDate],
        });
      const [sessionCap] = await tx
        .select({ used: dailyRewardCaps.usedUnits })
        .from(dailyRewardCaps)
        .where(
          and(
            eq(dailyRewardCaps.userId, userId),
            eq(dailyRewardCaps.reason, 'focus_sessions'),
            eq(dailyRewardCaps.bucketDate, args.utcDate),
          ),
        )
        .for('update');
      if ((sessionCap?.used ?? 0) >= args.maxDailySessions) {
        return { grantedMinutes: 0, newBalance: await currentBalance(tx, userId), awarded: false };
      }
      await tx
        .update(dailyRewardCaps)
        .set({ usedUnits: sql`${dailyRewardCaps.usedUnits} + 1`, updatedAt: new Date() })
        .where(
          and(
            eq(dailyRewardCaps.userId, userId),
            eq(dailyRewardCaps.reason, 'focus_sessions'),
            eq(dailyRewardCaps.bucketDate, args.utcDate),
          ),
        );

      await tx
        .update(dailyRewardCaps)
        .set({ usedUnits: sql`${dailyRewardCaps.usedUnits} + ${granted}`, updatedAt: new Date() })
        .where(
          and(
            eq(dailyRewardCaps.userId, userId),
            eq(dailyRewardCaps.reason, 'focus'),
            eq(dailyRewardCaps.bucketDate, args.utcDate),
          ),
        );

      const amount = Math.max(0, Math.round(args.coinsForMinutes(granted)));
      // THEN users (after the cap lock — canonical order).
      const [updated] = await tx
        .update(users)
        .set({ coins: sql`${users.coins} + ${amount}`, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ coins: users.coins });
      const balanceAfter = updated?.coins ?? 0;

      const inserted = await tx
        .insert(coinTransactions)
        .values({
          userId,
          amount,
          reason: 'focus_session',
          label: args.label ?? `${granted} min focused`,
          dedupeKey,
          sourceType: 'focus_session',
          sourceId: args.sessionId,
          balanceAfter,
          metadata: { grantedMinutes: granted },
        })
        .onConflictDoNothing({
          target: [coinTransactions.userId, coinTransactions.dedupeKey],
          where: sql`${coinTransactions.dedupeKey} is not null`,
        })
        .returning({ id: coinTransactions.id });
      if (inserted.length === 0) throw new DuplicateAwardRace();

      return { grantedMinutes: granted, newBalance: balanceAfter, awarded: true };
    });
  } catch (err) {
    if (err instanceof DuplicateAwardRace) {
      return { grantedMinutes: 0, newBalance: await currentBalance(db, userId), awarded: false };
    }
    throw err;
  }
}
