/**
 * C1 regression guard — a focus session's rewarded length must be derived from
 * server-trusted wall-clock time and hard-bounded, so a fabricated client
 * `duration` can no longer mint unbounded coins (audit finding C1).
 */
import { describe, it, expect } from 'vitest';
import {
  rewardedSessionMinutes,
  isDurationTampered,
  MAX_SESSION_MINUTES,
  DURATION_TAMPER_TOLERANCE_SECS,
} from '@/utils/streaks/streakUtils';

describe('C1 — focus-session duration is server-bounded', () => {
  it('flags the original 600k-coin exploit (duration: 36_000_000s over ~1s elapsed) as tampering', () => {
    expect(isDurationTampered(1, 36_000_000)).toBe(true);
  });

  it('caps rewarded minutes at MAX_SESSION_MINUTES even when wall-clock spans longer', () => {
    const tenHoursSecs = 10 * 60 * 60;
    // 1 coin/min ⇒ this is the hard ceiling on a single session's award.
    expect(rewardedSessionMinutes(tenHoursSecs, tenHoursSecs)).toBe(MAX_SESSION_MINUTES);
  });

  it('never awards more than the real elapsed wall-clock time', () => {
    // Client claims 60 min but only 10 min actually elapsed → award 10.
    expect(rewardedSessionMinutes(10 * 60, 60 * 60)).toBe(10);
  });

  it('never awards more than the client-reported duration', () => {
    // 60 min elapsed but client only claims 5 min → award 5.
    expect(rewardedSessionMinutes(60 * 60, 5 * 60)).toBe(5);
  });

  it('awards a normal 25-minute pomodoro in full', () => {
    expect(rewardedSessionMinutes(25 * 60, 25 * 60)).toBe(25);
  });

  it('P1-3 — sub-minute sessions now earn NOTHING, not a floor of 1', () => {
    // This previously asserted `toBe(1)`, i.e. it pinned the exploitable
    // behaviour: an instantaneous session still granted one rewarded minute,
    // which collected the flat 5-coin `focus_session` base. 720 of those were
    // worth ~5x an honest 12-hour day inside the same minute cap.
    //
    // A 30-second "focus session" is not focus. It is still recorded; it just
    // does not pay.
    expect(rewardedSessionMinutes(30, 30)).toBe(0);
    expect(rewardedSessionMinutes(0, 0)).toBe(0);
    // The first genuinely rewardable duration.
    expect(rewardedSessionMinutes(60, 60)).toBe(1);
  });

  it('allows small clock skew within tolerance but rejects beyond it', () => {
    expect(isDurationTampered(600, 600 + DURATION_TAMPER_TOLERANCE_SECS - 1)).toBe(false);
    expect(isDurationTampered(600, 600 + DURATION_TAMPER_TOLERANCE_SECS + 1)).toBe(true);
  });

  it('treats a matched legitimate long session as bounded, not tampered', () => {
    // 3h claimed, 3h elapsed → not tampering, awards 180 min.
    expect(isDurationTampered(3 * 60 * 60, 3 * 60 * 60)).toBe(false);
    expect(rewardedSessionMinutes(3 * 60 * 60, 3 * 60 * 60)).toBe(180);
  });
});
