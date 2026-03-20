import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CalendarEvent } from '../types';

interface PlannerState {
  /** Microsoft/Outlook events — fetched from provider API, browser-cached only. NOT in DB. */
  outlookEvents: CalendarEvent[];
  /** Google Calendar events — fetched from provider API, browser-cached only. NOT in DB. */
  googleEvents: CalendarEvent[];
  outlookConnected: boolean;
  outlookSyncing: boolean;

  setOutlookEvents: (events: CalendarEvent[]) => void;
  setGoogleEvents:  (events: CalendarEvent[]) => void;
  setOutlookConnected: (connected: boolean) => void;
  setOutlookSyncing:   (syncing: boolean) => void;
  /** Clear all in-memory external event arrays (call on signout or provider disconnect). */
  clearExternalEvents: () => void;
}

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set) => ({
      outlookEvents: [],
      googleEvents:  [],
      outlookConnected: false,
      outlookSyncing:   false,

      setOutlookEvents:    (outlookEvents)    => set({ outlookEvents }),
      setGoogleEvents:     (googleEvents)     => set({ googleEvents }),
      setOutlookConnected: (outlookConnected) => set({ outlookConnected }),
      setOutlookSyncing:   (outlookSyncing)   => set({ outlookSyncing }),
      clearExternalEvents: () => set({ outlookEvents: [], googleEvents: [] }),
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
