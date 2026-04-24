import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Achievement, FocusSessionResult } from '@/types';
import * as streakPersistence from '@/lib/persistence/streakPersistence';

interface StreakState {
  // NOTE: `coins` is NOT tracked here. Coin balance lives in useCoinsStore as
  // the single source of truth, rehydrated from GET /api/coins. Two stores
  // holding the same value produced divergent reads after a session.
  dailyStreak: number;
  bestDailyStreak: number;
  sessionStreak: number;
  bestSessionStreak: number;
  achievements: Achievement[];
  unseenAchievements: Achievement[];
  hydrated: boolean;
}

interface StreakActions {
  hydrateFromAPI: () => Promise<void>;
  applySessionResult: (result: FocusSessionResult) => void;
  markAchievementsSeen: () => void;
  setAchievements: (achievements: Achievement[]) => void;
}

export const useStreakStore = create<StreakState & StreakActions>()(
  persist(
    (set, get) => ({
      dailyStreak: 0,
      bestDailyStreak: 0,
      sessionStreak: 0,
      bestSessionStreak: 0,
      achievements: [],
      unseenAchievements: [],
      hydrated: false,

      hydrateFromAPI: async () => {
        const data = await streakPersistence.fetchStreakData();
        if (data) {
          set({
            dailyStreak: data.dailyStreak,
            bestDailyStreak: data.bestDailyStreak,
            sessionStreak: data.sessionStreak,
            bestSessionStreak: data.bestSessionStreak,
            hydrated: true,
          });
        } else {
          set({ hydrated: true });
        }
      },

      applySessionResult: (result: FocusSessionResult) => {
        const newAchievements: Achievement[] = result.newAchievements.map((a) => ({
          id: crypto.randomUUID?.() ?? Math.random().toString(36),
          userId: '',
          type: a.type,
          unlockedAt: a.unlockedAt,
          seen: false,
        }));

        // Coin balance intentionally NOT updated here — see useCoinsStore.
        set((s) => ({
          dailyStreak: result.dailyStreak,
          sessionStreak: result.sessionStreak,
          bestDailyStreak: Math.max(s.bestDailyStreak, result.dailyStreak),
          bestSessionStreak: Math.max(s.bestSessionStreak, result.sessionStreak),
          achievements: [...s.achievements, ...newAchievements],
          unseenAchievements: [...s.unseenAchievements, ...newAchievements],
        }));
      },

      markAchievementsSeen: () => {
        set((s) => ({
          achievements: s.achievements.map((a) => ({ ...a, seen: true })),
          unseenAchievements: [],
        }));
      },

      setAchievements: (achievements: Achievement[]) => {
        set({
          achievements,
          unseenAchievements: achievements.filter((a) => !a.seen),
        });
      },
    }),
    {
      name: 'lumina-streaks',
      // v1 drops `coins` — see migrate(). Any lingering `coins` from an older
      // persisted payload is stripped so it can't silently rehydrate a stale
      // local balance that disagrees with the DB-backed useCoinsStore.
      version: 1,
      migrate: (persistedState, version) => {
        if (version < 1 && persistedState && typeof persistedState === 'object') {
          const { coins: _coins, ...rest } = persistedState as Record<string, unknown> & { coins?: unknown };
          void _coins;
          return rest as typeof persistedState;
        }
        return persistedState;
      },
      partialize: (s) => ({
        dailyStreak: s.dailyStreak,
        bestDailyStreak: s.bestDailyStreak,
        sessionStreak: s.sessionStreak,
        bestSessionStreak: s.bestSessionStreak,
      }),
    }
  )
);
