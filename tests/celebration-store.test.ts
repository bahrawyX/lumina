/**
 * The shared completion trophy (goals + tasks) must fire only on a genuine
 * award. This guards the same duplicate-celebration bug we fixed for the task
 * toast/confetti: a re-completion reports coinsEarned 0 and must NOT celebrate.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useCelebrationStore } from '@/store/useCelebrationStore';

describe('useCelebrationStore.celebrateForAward — trophy gated on a real award', () => {
  beforeEach(() => {
    useCelebrationStore.setState({ trophyVisible: false });
  });

  it('does NOT show the trophy for a duplicate (coinsEarned === 0)', () => {
    useCelebrationStore.getState().celebrateForAward(0);
    expect(useCelebrationStore.getState().trophyVisible).toBe(false);
  });

  it('does NOT show for negative or NaN amounts', () => {
    useCelebrationStore.getState().celebrateForAward(-5);
    expect(useCelebrationStore.getState().trophyVisible).toBe(false);
    useCelebrationStore.getState().celebrateForAward(Number.NaN);
    expect(useCelebrationStore.getState().trophyVisible).toBe(false);
  });

  it('shows the trophy for a real award (coinsEarned > 0)', () => {
    useCelebrationStore.getState().celebrateForAward(15);
    expect(useCelebrationStore.getState().trophyVisible).toBe(true);
  });

  it('dismissTrophy hides it again', () => {
    useCelebrationStore.getState().celebrateForAward(15);
    expect(useCelebrationStore.getState().trophyVisible).toBe(true);
    useCelebrationStore.getState().dismissTrophy();
    expect(useCelebrationStore.getState().trophyVisible).toBe(false);
  });
});
