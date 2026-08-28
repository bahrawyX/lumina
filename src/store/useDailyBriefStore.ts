import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format } from 'date-fns';
import { useCoinsStore } from './useCoinsStore';

interface NextEventData {
  title: string;
  startTime: string;
  minutesUntil: number;
}

interface FocusWindowData {
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

interface TopTaskData {
  id: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  dueDate: string | null;
  estimatedMinutes: number;
}

export interface DailyBriefData {
  date: string;
  eventCount: number;
  nextEvent: NextEventData | null;
  meetingHours: number;
  bestFocusWindow: FocusWindowData | null;
  topPriorityTask: TopTaskData | null;
  overdueCount: number;
  totalOpenTasks: number;
  plannedTaskCount: number;
  currentStreak: number;
  isStreakAtRisk: boolean;
  narrative: string;
  narrativeGeneratedAt: string;
}

interface DailyBriefState {
  brief: DailyBriefData | null;
  dismissedDate: string | null;
  lastFetched: string | null;
  isLoading: boolean;
  error: string | null;

  /**
   * P2-8: takes no timezone. The server derives the day from
   * `users.timezone`, because the brief's cache row is keyed on that day
   * and a client-supplied zone let the caller choose which row it read and
   * wrote. Callers still key their re-fetch effect on the local zone, so a
   * user who travels still refreshes.
   */
  fetchBrief: () => Promise<void>;
  dismiss: () => void;
  refresh: () => Promise<void>;
  isDismissedToday: () => boolean;
  shouldShow: () => boolean;
}

export const useDailyBriefStore = create<DailyBriefState>()(
  persist(
    (set, get) => ({
      brief: null,
      dismissedDate: null,
      lastFetched: null,
      isLoading: false,
      error: null,

      fetchBrief: async () => {
        set({ isLoading: true, error: null });
        try {
          // P2-8: no `?timezone=`. The server reads `users.timezone`, because
          // the brief's cache row is keyed on the day it computes and a
          // client-supplied zone let the caller pick which row it read and
          // wrote. `timezone` stays in the signature: it is what the effects
          // above key their re-fetch on, so a user who travels still
          // refreshes.
          const res = await fetch('/api/daily-brief');
          if (res.status === 401) {
            // Not authenticated — stop trying for this session.
            // Mark lastFetched so the effect doesn't loop on null.
            set({
              isLoading: false,
              lastFetched: new Date().toISOString(),
              error: 'unauthenticated',
            });
            return;
          }
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const data: DailyBriefData = await res.json();
          set({
            brief: data,
            lastFetched: new Date().toISOString(),
            isLoading: false,
          });
        } catch (err) {
          // Cache the failure timestamp so the mount effect doesn't re-fire forever.
          set({
            isLoading: false,
            lastFetched: new Date().toISOString(),
            error: err instanceof Error ? err.message : 'Failed to load brief',
          });
        }
      },

      dismiss: () => {
        set({ dismissedDate: format(new Date(), 'yyyy-MM-dd') });
        // Award coins for reading the daily brief (server dedupes by day).
        // The endpoint already awaits the award and returns `newBalance`
        // when one was granted, so we sync the badge directly.
        void fetch('/api/coins/award-brief', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
          .then(async (res) => {
            if (!res.ok) return;
            try {
              const data = (await res.json()) as { newBalance?: number };
              if (typeof data?.newBalance === 'number') {
                useCoinsStore.getState().setBalance(data.newBalance);
              }
            } catch { /* ignore */ }
          })
          .catch(() => {});
      },

      refresh: async () => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch('/api/daily-brief?refresh=true');
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data: DailyBriefData = await res.json();
          set({
            brief: data,
            lastFetched: new Date().toISOString(),
            isLoading: false,
          });
        } catch (err) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Failed to refresh',
          });
        }
      },

      isDismissedToday: () => {
        const { dismissedDate } = get();
        return dismissedDate === format(new Date(), 'yyyy-MM-dd');
      },

      shouldShow: () => {
        const { brief, dismissedDate } = get();
        const today = format(new Date(), 'yyyy-MM-dd');
        return brief !== null && dismissedDate !== today;
      },
    }),
    {
      name: 'lumina-daily-brief',
      /**
       * F5.5: persisted with no `version`, so zustand had no way to know an
       * old payload was an old SHAPE. A rename or a type change would rehydrate
       * last release's object straight into this release's store — silently,
       * with no error and no way to detect it afterwards.
       *
       * `version: 1` plus a `migrate` that drops anything it does not
       * recognise is the cheap correct answer: this store persists a single dismissed-date string,
       * so discarding an unknown payload costs the user seeing today's brief once more.
       */
      version: 1,
      migrate: (persisted, from) => {
        // Anything written before versioning existed is shape-unknown.
        if (from < 1) return {} as Record<string, unknown>;
        return persisted as Record<string, unknown>;
      },
      // Only the dismissed-date flag is persisted — the brief itself is
      // re-fetched from the API on mount so deleting it from the DB takes
      // effect immediately and a different user can't see the previous
      // user's brief.
      partialize: (state) => ({
        dismissedDate: state.dismissedDate,
      }),
    },
  ),
);

// ── Midnight refresh timer ──────────────────────────────────────────────────
let midnightTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleMidnightRefresh() {
  if (midnightTimer) clearTimeout(midnightTimer);
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = midnight.getTime() - now.getTime();

  midnightTimer = setTimeout(() => {
    // Clear dismissed date and brief at midnight
    useDailyBriefStore.setState({
      dismissedDate: null,
      brief: null,
      lastFetched: null,
    });
    // Schedule next midnight
    scheduleMidnightRefresh();
  }, msUntilMidnight);
}

// Initialize midnight timer on module load (client-side only)
if (typeof window !== 'undefined') {
  scheduleMidnightRefresh();
}
