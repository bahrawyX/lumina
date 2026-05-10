import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CalendarEvent } from '../types';

interface PlannerState {
  /** Microsoft/Outlook events — fetched from provider API, browser-cached only. NOT in DB. */
  outlookEvents: CalendarEvent[];
  /** Google Calendar events — fetched from provider API, browser-cached only. NOT in DB. */
  googleEvents: CalendarEvent[];
  /** Session-only demo events (context previews, onboarding) — never persisted. */
  demoLocalEvents: CalendarEvent[];
  outlookConnected: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;

  setOutlookEvents: (events: CalendarEvent[]) => void;
  setGoogleEvents:  (events: CalendarEvent[]) => void;
  setDemoLocalEvents: (events: CalendarEvent[]) => void;
  setOutlookConnected: (connected: boolean) => void;
  setIsSyncing: (syncing: boolean) => void;
  setLastSyncedAt: (iso: string | null) => void;
  setSyncError: (message: string | null) => void;
  /** Clear all in-memory external event arrays (call on signout or provider disconnect). */
  clearExternalEvents: () => void;
}

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set) => ({
      outlookEvents: [],
      googleEvents:  [],
      demoLocalEvents: [],
      outlookConnected: false,
      isSyncing: false,
      lastSyncedAt: null,
      syncError: null,

      setOutlookEvents:    (outlookEvents)    => set({ outlookEvents }),
      setGoogleEvents:     (googleEvents)     => set({ googleEvents }),
      setDemoLocalEvents:  (demoLocalEvents)  => set({ demoLocalEvents }),
      setOutlookConnected: (outlookConnected) => set({ outlookConnected }),
      setIsSyncing:        (isSyncing)        => set({ isSyncing }),
      setLastSyncedAt:     (lastSyncedAt)     => set({ lastSyncedAt }),
      setSyncError:        (syncError)        => set({ syncError }),
      clearExternalEvents: () => set({ outlookEvents: [], googleEvents: [], demoLocalEvents: [] }),
    }),
    {
      name: 'lumina-planner',
      // Explicit return type guarantees event arrays can NEVER accidentally
      // be added to localStorage persistence in a future edit.
      partialize: (state): { outlookConnected: boolean } => ({
        outlookConnected: state.outlookConnected,
      }),
    }
  )
);
