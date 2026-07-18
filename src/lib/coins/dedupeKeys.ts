/**
 * Deterministic dedupe-key construction for the coin ledger.
 *
 * Every ledger row carries a `dedupeKey` that is UNIQUE per (userId, key). The
 * key encodes the idempotency scope of the award so a replay attempts an insert
 * that already exists → unique violation → no coins (see awardCoins). Pure and
 * unit-tested — this is the classification that makes the whole economy
 * replay-proof, so it must not depend on DB state.
 */
import type { Award } from '@/lib/coins/earnRules';

/** An earn-rule award plus its resolved idempotency key + provenance. */
export interface AwardEntry extends Award {
  dedupeKey: string;
  sourceType?: string;
  sourceId?: string;
}

/**
 * UTC calendar date 'YYYY-MM-DD' — the anchor for day-scoped keys and cap
 * buckets. UTC (not the user's settable tz) so a timezone change cannot roll
 * the window and re-open a daily award. Mirrors daily_reward_caps.bucket_date.
 */
export function utcDateKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Awards capped to once-per-user-per-UTC-day (keyed by date, not entity). */
const PER_DAY_REASONS = new Set<string>([
  'first_task_day',
  'task_burst_5',
  'task_burst_10',
  'daily_brief',
  'plan_day',
  'planner_day',
  'ai_docs',
]);

/** Awards granted at most once per user, ever (keyed by reason alone). */
const PER_USER_REASONS = new Set<string>(['first_doc']);

/** True for once-per-user awards: explicit set + streak milestones (level in reason). */
function isPerUserOnce(reason: string): boolean {
  return (
    PER_USER_REASONS.has(reason) ||
    reason.startsWith('daily_streak_') ||
    reason.startsWith('session_streak_')
  );
}

/**
 * Resolve the dedupe key for a single earn-rule award.
 *  - per-day reasons  → `${reason}:${utcDate}`   (one per user per UTC day)
 *  - streak milestones → `${reason}`             (one per user, level in reason)
 *  - everything else  → `${reason}:${entityId}`  (one per source entity)
 *
 * `sourceType`/`sourceId` provenance are attached together (never one alone).
 */
export function scopeAward(
  award: Award,
  ctx: { entityId?: string; sourceType?: string; utcDate: string },
): AwardEntry {
  let dedupeKey: string;
  if (PER_DAY_REASONS.has(award.reason)) {
    dedupeKey = `${award.reason}:${ctx.utcDate}`;
  } else if (isPerUserOnce(award.reason)) {
    dedupeKey = award.reason;
  } else {
    if (!ctx.entityId) {
      throw new Error(`scopeAward: reason '${award.reason}' requires an entityId`);
    }
    dedupeKey = `${award.reason}:${ctx.entityId}`;
  }
  const hasProvenance = ctx.sourceType && ctx.entityId;
  return {
    ...award,
    dedupeKey,
    ...(hasProvenance ? { sourceType: ctx.sourceType, sourceId: ctx.entityId } : {}),
  };
}

/** Map a batch of earn-rule awards to keyed ledger entries under one scope. */
export function scopeAwards(
  awards: Award[],
  ctx: { entityId?: string; sourceType?: string; utcDate: string },
): AwardEntry[] {
  return awards.map((a) => scopeAward(a, ctx));
}
