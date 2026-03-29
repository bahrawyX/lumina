import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Achievement, FocusSessionResult } from '@/types';
import * as streakPersistence from '@/lib/persistence/streakPersistence';

interface StreakState {
  coins: number;
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
      coins: 0,
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
            coins: data.coins,
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

        set((s) => ({
          coins: result.newCoins,
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
      partialize: (s) => ({
        coins: s.coins,
        dailyStreak: s.dailyStreak,
        bestDailyStreak: s.bestDailyStreak,
        sessionStreak: s.sessionStreak,
        bestSessionStreak: s.bestSessionStreak,
      }),
    }
  )
);
