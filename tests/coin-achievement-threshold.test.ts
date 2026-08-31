/**
 * `coins_100` must fire when the user has 100 coins, not when a stale formula
 * says they might.
 *
 * The achievement check was fed `streakUpdate.coins`, which
 * `computeStreakUpdate` produced as
 *
 *     const coinsEarned = Math.max(1, durationMinutes);  // 1 coin per minute
 *     const coins = user.coins + coinsEarned;
 *
 * That value was never written to `users.coins` — the ledger in `lib/coins`
 * has owned the balance since the economy-integrity work — so it existed for
 * exactly one purpose: telling the achievement rules how many coins the user
 * had. And it was wrong, because the real award comes from
 * `focusSessionAwards`:
 *
 *     base 5  +  floor(minutes / 10) * 2  (+ bonuses)
 *
 * A 25-minute session earns 9. The formula claimed 25.
 *
 * The consequence is not just an early toast. `checkNewAchievements` skips
 * anything already in `existingTypes`, so once `coins_100` unlocks it is never
 * revisited — the user gets it at ~89 coins and never gets it at 100.
 */
import { describe, it, expect } from 'vitest';
import { checkNewAchievements, ACHIEVEMENT_RULES } from '@/utils/streaks/achievementUtils';
import { focusSessionAwards } from '@/lib/coins/earnRules';

/** What the ledger actually grants for a plain session of N minutes. */
function realAward(minutes: number): number {
  return focusSessionAwards(minutes).reduce((sum, a) => sum + a.amount, 0);
}

/** What the removed formula claimed. */
function staleAward(minutes: number): number {
  return Math.max(1, minutes);
}

describe('the two numbers really did disagree', () => {
  it.each([10, 25, 45, 60])('a %i-minute session', (minutes) => {
    expect(realAward(minutes)).toBeLessThan(staleAward(minutes));
  });

  it('by roughly 3x at 25 minutes', () => {
    // 5 + floor(25/10)*2 = 9, against 25.
    expect(realAward(25)).toBe(9);
    expect(staleAward(25)).toBe(25);
  });
});

describe('coin achievements are judged on the real balance', () => {
  const none = new Set<string>();

  it('does not unlock 100 coins at a true balance of 89', () => {
    // 80 before + a 25-minute session. Real: 80 + 9 = 89.
    const previousCoins = 80;
    const real = previousCoins + realAward(25);
    expect(real).toBe(89);

    const unlocked = checkNewAchievements(
      { sessionStreak: 1, dailyStreak: 1, coins: real },
      previousCoins,
      none,
      'coins',
    );
    expect(unlocked).not.toContain('coins_100');
  });

  it('would have unlocked it on the stale number — the bug', () => {
    // Same session, judged the old way: 80 + 25 = 105.
    const previousCoins = 80;
    const stale = previousCoins + staleAward(25);

    const unlocked = checkNewAchievements(
      { sessionStreak: 1, dailyStreak: 1, coins: stale },
      previousCoins,
      none,
      'coins',
    );
    expect(unlocked).toContain('coins_100');
  });

  it('unlocks once the balance genuinely crosses 100', () => {
    const previousCoins = 95;
    const real = previousCoins + realAward(25); // 104
    const unlocked = checkNewAchievements(
      { sessionStreak: 1, dailyStreak: 1, coins: real },
      previousCoins,
      none,
      'coins',
    );
    expect(unlocked).toContain('coins_100');
  });

  it('never grants the same one twice', () => {
    // Why the early unlock is permanent: an already-held type is skipped, so
    // the user does not get it again at the correct moment.
    const unlocked = checkNewAchievements(
      { sessionStreak: 1, dailyStreak: 1, coins: 500 },
      0,
      new Set(['coins_100']),
      'coins',
    );
    expect(unlocked).not.toContain('coins_100');
    expect(unlocked).toContain('coins_500');
  });
});

describe('the phases are separable, which is what makes the fix possible', () => {
  it('every rule declares one', () => {
    for (const rule of ACHIEVEMENT_RULES) {
      expect(['streak', 'coins'], `${rule.type} has no phase`).toContain(rule.phase);
    }
  });

  it('the streak phase cannot fire a coin rule', () => {
    // The in-transaction pass runs before the ledger settles, so it must not
    // be able to judge a balance.
    const unlocked = checkNewAchievements(
      { sessionStreak: 1, dailyStreak: 1, coins: 10_000 },
      0,
      new Set(),
      'streak',
    );
    expect(unlocked).not.toContain('coins_100');
    expect(unlocked).not.toContain('coins_500');
  });

  it('the coin phase cannot fire a streak rule', () => {
    const unlocked = checkNewAchievements(
      { sessionStreak: 10, dailyStreak: 30, coins: 0 },
      0,
      new Set(),
      'coins',
    );
    expect(unlocked).toEqual([]);
  });

  it('together they still cover every rule', () => {
    const all = new Set(ACHIEVEMENT_RULES.map((r) => r.type));
    const streak = ACHIEVEMENT_RULES.filter((r) => r.phase === 'streak').map((r) => r.type);
    const coins = ACHIEVEMENT_RULES.filter((r) => r.phase === 'coins').map((r) => r.type);
    expect(new Set([...streak, ...coins])).toEqual(all);
  });
});

describe('the fabricated formula is gone from the source', () => {
  it('computeStreakUpdate no longer returns a coin balance', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(
      join(process.cwd(), 'src', 'utils', 'streaks', 'streakUtils.ts'), 'utf8',
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Leaving it in place would invite a future caller to trust it again.
    expect(code).not.toMatch(/Math\.max\(1,\s*durationMinutes\)/);
  });
});
