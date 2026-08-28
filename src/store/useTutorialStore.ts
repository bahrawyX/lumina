import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TutorialState {
  isActive: boolean;
  currentStep: number;
  hasCompletedTutorial: boolean;
  hasSeenPrompt: boolean;
  startTutorial: () => void;
  nextStep: (totalSteps: number) => void;
  skipTutorial: () => void;
  dismissPrompt: () => void;
}

export const useTutorialStore = create<TutorialState>()(
  persist(
    (set) => ({
      isActive: false,
      currentStep: 0,
      hasCompletedTutorial: false,
      hasSeenPrompt: false,

      startTutorial: () =>
        set({ isActive: true, currentStep: 0, hasSeenPrompt: true }),

      nextStep: (totalSteps) =>
        set((s) => {
          if (s.currentStep >= totalSteps - 1) {
            return { isActive: false, hasCompletedTutorial: true, currentStep: 0 };
          }
          return { currentStep: s.currentStep + 1 };
        }),

      skipTutorial: () =>
        set({ isActive: false, hasCompletedTutorial: true, currentStep: 0 }),

      dismissPrompt: () =>
        set({ hasSeenPrompt: true }),
    }),
    {
      name: 'lumina-tutorial',
      /**
       * F5.5: persisted with no `version`, so zustand had no way to know an
       * old payload was an old SHAPE. A rename or a type change would rehydrate
       * last release's object straight into this release's store — silently,
       * with no error and no way to detect it afterwards.
       *
       * `version: 1` plus a `migrate` that drops anything it does not
       * recognise is the cheap correct answer: this store persists two seen/completed booleans,
       * so discarding an unknown payload costs the user being offered the tutorial once more.
       */
      version: 1,
      migrate: (persisted, from) => {
        // Anything written before versioning existed is shape-unknown.
        if (from < 1) return {} as Record<string, unknown>;
        return persisted as Record<string, unknown>;
      },
      partialize: (s) => ({
        hasCompletedTutorial: s.hasCompletedTutorial,
        hasSeenPrompt: s.hasSeenPrompt,
      }),
    },
  ),
);
