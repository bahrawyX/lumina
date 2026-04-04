import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format } from 'date-fns';

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

  fetchBrief: (timezone: string) => Promise<void>;
  dismiss: () => void;
  refresh: (timezone: string) => Promise<void>;
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

      fetchBrief: async (timezone) => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch(`/api/daily-brief?timezone=${encodeURIComponent(timezone)}`);
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
          set({
            isLoading: false,
            lastFetched: null, // Don't cache failed fetches — allow retry on next mount
            error: err instanceof Error ? err.message : 'Failed to load brief',
          });
        }
      },

      dismiss: () => {
        set({ dismissedDate: format(new Date(), 'yyyy-MM-dd') });
      },

      refresh: async (timezone) => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch(
            `/api/daily-brief?timezone=${encodeURIComponent(timezone)}&refresh=true`,
          );
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
      partialize: (state) => ({
        brief: state.brief,
        dismissedDate: state.dismissedDate,
        lastFetched: state.lastFetched,
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
