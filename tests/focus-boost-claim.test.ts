/**
 * One Focus Boost buys one doubled session.
 *
 * `spendStreakShield` (H4) established how a consumable is spent here: put the
 * `> 0` check in the UPDATE's WHERE, so Postgres re-evaluates it against the
 * row it locks, and read success from whether a row came back.
 *
 * The focus-session route used the same decrement SQL and none of that:
 *
 *     const [uc] = await db.select({ consumables: users.consumables })…
 *     const hasFocusBoost = (uc?.consumables?.focusBoost ?? 0) > 0;
 *     …award, doubled when hasFocusBoost…
 *     if (hasFocusBoost && focusRes.awarded) { …focusBoost - 1… }
 *
 * Read, decide, then decrement, with nothing holding the row between them. Two
 * sessions finishing together both saw `focusBoost: 1`, both doubled, and both
 * decremented — `greatest(0, …)` floors the second at zero, so one boost paid
 * for two. The boost doubles the whole session reward, so that is real
 * currency.
 *
 * The claim is atomic now, which forces a second question the old ordering had
 * answered by accident: the award can still come back as nothing when the daily
 * cap is spent. Claiming first and refunding on `!awarded` keeps both
 * properties — no double-spend, and no boost burnt for a reward of zero.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const spend = read('src/lib/coins/spendFocusBoost.ts');
const route = read('src/app/api/focus-sessions/route.ts');
const shield = read('src/lib/streaks/spendStreakShield.ts');

describe('the claim is guarded in the WHERE, like the shield', () => {
  it('only updates a row that still has a boost', () => {
    // Without this the UPDATE always succeeds and the "did I get one?" answer
    // is meaningless.
    expect(code(spend)).toMatch(/focusBoost'\)::int, 0\) > 0/);
  });

  it('reports success from the returned rows, not from an earlier read', () => {
    const c = code(spend);
    expect(c).toMatch(/\.returning\(/);
    expect(c).toMatch(/updated\.length > 0/);
  });

  it('matches the shape spendStreakShield already used', () => {
    // Same guard, same `greatest(0, …)` floor, same returning-rows contract.
    for (const fragment of ['greatest(0, coalesce(', ')::int, 0) > 0', '.returning(']) {
      expect(code(shield), `shield lost ${fragment}`).toContain(fragment);
      expect(code(spend), `focus boost lacks ${fragment}`).toContain(fragment);
    }
  });
});

describe('the route claims before awarding', () => {
  it('gets its answer from spendFocusBoost', () => {
    expect(code(route)).toMatch(/const hasFocusBoost = await spendFocusBoost\(userId\)/);
  });

  it('no longer reads the consumable and hopes', () => {
    // The read-then-decide shape is the bug; it must not come back.
    const c = code(route);
    expect(c).not.toMatch(/\)\?\.focusBoost \?\? 0\) > 0/);
    expect(c).not.toMatch(/select\(\{ consumables: users\.consumables \}\)/);
  });

  it('claims before the award, so the award can trust the answer', () => {
    const c = code(route);
    const claim = c.indexOf('spendFocusBoost(userId)');
    const award = c.indexOf('awardFocusCoins(userId');
    expect(claim).toBeGreaterThan(-1);
    expect(award).toBeGreaterThan(claim);
  });

  it('refunds when the daily cap granted nothing', () => {
    // Otherwise the atomic claim would be a regression: a boost spent for zero.
    expect(code(route)).toMatch(/if \(hasFocusBoost && !focusRes\.awarded\)/);
    expect(code(route)).toMatch(/refundFocusBoost\(userId\)/);
  });

  it('does not decrement a second time on the success path', () => {
    // The claim already spent it; a further decrement would charge twice.
    expect(code(route)).not.toContain("'{focusBoost}'");
  });
});

describe('the reminder cron can name the event it failed on', () => {
  it('interpolates the id instead of printing the placeholder', () => {
    /**
     * The defect was a QUOTED string holding a template placeholder:
     *
     *     logger.error('Error for event ${event.id}', …)
     *
     * Single quotes, so it logged the placeholder verbatim and the one thing
     * the line existed to report was the one thing it never did.
     *
     * Checked as "no quoted string still holds a placeholder", NOT as "the
     * file does not contain ${event.id}" — that was the first version of this
     * assertion, and it failed on the legitimate template a few lines above:
     *
     *     tag: `event-reminder-${event.id}`
     *
     * which interpolates correctly and always did.
     */
    const cron = code(read('src/app/api/cron/event-reminders/route.ts'));

    const offenders = cron.split('\n').filter((line) => {
      // Drop template literals first; whatever placeholder is left is inside a
      // plain quoted string and will never interpolate.
      const withoutTemplates = line.replace(/`[^`]*`/g, '');
      return /'[^']*\$\{/.test(withoutTemplates) || /"[^"]*\$\{/.test(withoutTemplates);
    });

    expect(offenders, 'a quoted string is holding a ${} placeholder').toEqual([]);
    expect(cron).toMatch(/eventId: event\.id/);
  });
});
