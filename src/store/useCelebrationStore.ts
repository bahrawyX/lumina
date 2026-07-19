import { create } from 'zustand';

/**
 * Drives the global completion-celebration overlay (the animated trophy shown
 * on a real goal OR task completion award). Shared by goals + tasks so the
 * trophy is defined once and triggered from one path — the persistence layers
 * call `celebrateForAward` with the server-reported `coinsEarned`.
 */
interface CelebrationState {
  /** True while the trophy overlay is showing. */
  trophyVisible: boolean;
  /**
   * Fire the trophy — but ONLY for a genuine award. `coinsEarned` comes straight
   * from the server award response; a re-completion duplicate reports 0 and must
   * NOT celebrate (same gate as the coin toast + confetti).
   */
  celebrateForAward: (coinsEarned: number) => void;
  dismissTrophy: () => void;
}

export const useCelebrationStore = create<CelebrationState>((set) => ({
  trophyVisible: false,
  celebrateForAward: (coinsEarned) => {
    if (typeof coinsEarned === 'number' && coinsEarned > 0) set({ trophyVisible: true });
  },
  dismissTrophy: () => set({ trophyVisible: false }),
}));
