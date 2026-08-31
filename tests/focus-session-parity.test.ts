/**
 * `/focus` and `/pomodoro` must reward a session the same way.
 *
 * They are two pages over the same timer, and each carried its own ~75-line
 * copy of "what happens when a session finishes" — the POST, the streak
 * update, the coin toast, the milestone overlay, the achievement queue, the
 * push, the task-completion prompt. Two copies of a reward path is a bug
 * generator, and it had already generated one: the copy on `/pomodoro` was
 * missing
 *
 *   - `showCoinToast`, so a session there earned coins and never said so; and
 *   - the streak-milestone overlay, so a 3/7/14/30-day streak passed in
 *     silence.
 *
 * Which copy is which matters. `/pomodoro` is the route in the mobile bottom
 * bar, labelled "Focus". `/focus` — the copy that had both — is in the More
 * menu as "Focus Timer". The degraded one was the one most people reached.
 *
 * Both now call `useFocusSessionComplete`. These check they still do, rather
 * than checking the behaviour twice.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const focusPage = readFileSync(
  join(process.cwd(), 'src', 'components', 'pages', 'FocusPage.tsx'), 'utf8',
);
const pomodoroPage = readFileSync(
  join(process.cwd(), 'src', 'app', '(app)', 'pomodoro', 'page.tsx'), 'utf8',
);
const hook = readFileSync(
  join(process.cwd(), 'src', 'hooks', 'useFocusSessionComplete.ts'), 'utf8',
);

/** Statements only — every one of these files explains the old bug in prose. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('both routes share one implementation', () => {
  it.each([
    ['FocusPage', focusPage],
    ['pomodoro/page', pomodoroPage],
  ])('%s calls useFocusSessionComplete', (_name, src) => {
    expect(code(src)).toMatch(/useFocusSessionComplete\(\)/);
  });

  it.each([
    ['FocusPage', focusPage],
    ['pomodoro/page', pomodoroPage],
  ])('%s does not POST the session itself any more', (_name, src) => {
    // A second copy of the POST is how the two drifted the first time.
    expect(code(src)).not.toContain("'/api/focus-sessions'");
  });
});

describe('the rewards the degraded copy was missing', () => {
  it('the shared hook shows the coin toast', () => {
    expect(code(hook)).toMatch(/showCoinToast\(result\.coinsEarned/);
  });

  it('the shared hook celebrates streak milestones', () => {
    const c = code(hook);
    expect(c).toMatch(/STREAK_MILESTONES\.has\(result\.dailyStreak\)/);
    expect(c).toMatch(/SESSION_MILESTONES\.has\(result\.sessionStreak\)/);
    expect(c).toMatch(/setShowStreakFire\(true\)/);
  });

  it('both pages actually render the overlay the hook drives', () => {
    // The hook can set `showStreakFire` all it likes; a page that never
    // renders `LottieOverlay` still shows nothing. `/pomodoro` was that page.
    for (const [name, src] of [['FocusPage', focusPage], ['pomodoro/page', pomodoroPage]] as const) {
      expect(code(src), `${name} does not render the streak overlay`).toContain('LottieOverlay');
      expect(code(src), `${name} does not wire showStreakFire`).toContain('showStreakFire');
    }
  });

  it('both pages render the achievement modal off the shared queue', () => {
    for (const [name, src] of [['FocusPage', focusPage], ['pomodoro/page', pomodoroPage]] as const) {
      expect(code(src), `${name} lost the achievement modal`).toContain('handleAchievementDismiss');
    }
  });
});

describe('the under-threshold path stays honest', () => {
  it('awards nothing and says why', () => {
    // A short session is stored for history but earns no coins and no streak.
    // Celebrating it would be a lie; saying nothing would look like a failure.
    const c = code(hook);
    const guard = c.indexOf('result.underThreshold');
    const toastCall = c.indexOf('no coins earned this time');
    // The CALL, not the import at the top of the file — which is what the
    // first version of this matched, putting it before everything else.
    const coinToast = c.indexOf('showCoinToast(result.coinsEarned');
    expect(guard).toBeGreaterThan(-1);
    expect(toastCall).toBeGreaterThan(guard);
    // The early return has to come before any reward is handed out.
    expect(coinToast).toBeGreaterThan(toastCall);
  });
});
