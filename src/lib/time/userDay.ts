import 'server-only';
import { getUserTimeZone } from './eventTimeZone';
import { zonedDayBounds, zonedToday } from './zonedTime';

export interface UserDay {
  /** The user's IANA zone, from `users.timezone`, falling back to UTC. */
  zone: string;
  /** 'YYYY-MM-DD' — the calendar date it is where the user is. */
  date: string;
  /** First instant of that local day. */
  start: Date;
  /** First instant of the NEXT local day (exclusive upper bound). */
  end: Date;
}

/**
 * "Today", for a user, as real instants.
 *
 * P2-8: the codebase computed this with `new Date(y, m, d)`, which takes the
 * SERVER's zone — UTC on Vercel. Concretely, for a user in UTC-8:
 *
 *   - finishing their fifth task at 5pm local is 01:00 UTC the next day, so
 *     `task_burst_5` counted it into tomorrow and never fired;
 *   - `first_task_day` fired twice inside one local day, once before and once
 *     after 16:00 local;
 *   - "completed on due date" flipped a day early or late for anyone west of
 *     Greenwich.
 *
 * Day boundaries are a property of where the user is, not where the function
 * happens to run.
 *
 * NOTE: this is deliberately NOT what `daily_reward_caps.bucket_date` uses.
 * That bucket is keyed on UTC on purpose — a cap that moved with a
 * client-controlled zone could be reset by claiming to have flown east.
 */
export async function userDayBounds(
  db: unknown,
  userId: string,
  now: Date = new Date(),
): Promise<UserDay> {
  const zone = await getUserTimeZone(db, userId);
  const date = zonedToday(zone, now);
  const bounds = zonedDayBounds(date, zone);

  // `zonedDayBounds` returns null only for a malformed date string, which
  // `zonedToday` cannot produce. Falling back keeps the caller total.
  if (!bounds) {
    const start = new Date(`${date}T00:00:00.000Z`);
    return { zone, date, start, end: new Date(start.getTime() + 86_400_000) };
  }

  return { zone, date, start: bounds.start, end: bounds.end };
}
