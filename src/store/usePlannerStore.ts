import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CalendarEvent } from '../types';
import { mergeEventWindow, flattenEventWindows, type EventWindow } from '../lib/calendar/eventWindows';

interface PlannerState {
  /** Microsoft/Outlook events — flattened union of retained windows. Rendered. */
  outlookEvents: CalendarEvent[];
  /** Google Calendar events — flattened union of retained windows. Rendered. */
  googleEvents: CalendarEvent[];
  /** Apple Calendar events — fetched from provider API, browser-cached only. NOT in DB. */
  appleEvents: CalendarEvent[];
  /** Session-only demo events (context previews, onboarding) — never persisted. */
  demoLocalEvents: CalendarEvent[];
  // Per-provider retained date-windows (LRU, capped in eventWindows). Internal
  // working set backing outlookEvents/googleEvents so revisiting an already-viewed
  // month renders from memory instead of flashing empty during a refetch. Never
  // persisted; not meant to be read/rendered directly.
  outlookWindows: EventWindow[];
  googleWindows: EventWindow[];
  outlookConnected: boolean;
  googleConnected: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;

  /** Merge a fetched range's events into the retained windows (accumulates across views). */
  mergeOutlookEvents: (events: CalendarEvent[], startKey: string, endKey: string) => void;
  mergeGoogleEvents:  (events: CalendarEvent[], startKey: string, endKey: string) => void;
  /** Replace the rendered slice AND drop retained windows — for clearing only. */
  setOutlookEvents: (events: CalendarEvent[]) => void;
  setGoogleEvents:  (events: CalendarEvent[]) => void;
  setAppleEvents:   (events: CalendarEvent[]) => void;
  setDemoLocalEvents: (events: CalendarEvent[]) => void;
  setOutlookConnected: (connected: boolean) => void;
  setGoogleConnected: (connected: boolean) => void;
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
      appleEvents:   [],
      demoLocalEvents: [],
      outlookWindows: [],
      googleWindows:  [],
      outlookConnected: false,
      googleConnected: false,
      isSyncing: false,
      lastSyncedAt: null,
      syncError: null,

      mergeOutlookEvents: (events, startKey, endKey) =>
        set((s) => {
          const outlookWindows = mergeEventWindow(s.outlookWindows, startKey, endKey, events);
          return { outlookWindows, outlookEvents: flattenEventWindows(outlookWindows) };
        }),
      mergeGoogleEvents: (events, startKey, endKey) =>
        set((s) => {
          const googleWindows = mergeEventWindow(s.googleWindows, startKey, endKey, events);
          return { googleWindows, googleEvents: flattenEventWindows(googleWindows) };
        }),

      // setOutlook/GoogleEvents replace the rendered slice AND discard retained
      // windows. They are used only for clearing (disconnect / not-connected /
      // auth error); the accumulating path is mergeOutlook/GoogleEvents.
      setOutlookEvents:    (outlookEvents)    => set({ outlookEvents, outlookWindows: [] }),
      setGoogleEvents:     (googleEvents)     => set({ googleEvents, googleWindows: [] }),
      setAppleEvents:      (appleEvents)      => set({ appleEvents }),
      setDemoLocalEvents:  (demoLocalEvents)  => set({ demoLocalEvents }),
      setOutlookConnected: (outlookConnected) => set({ outlookConnected }),
      setGoogleConnected:  (googleConnected)  => set({ googleConnected }),
      setIsSyncing:        (isSyncing)        => set({ isSyncing }),
      setLastSyncedAt:     (lastSyncedAt)     => set({ lastSyncedAt }),
      setSyncError:        (syncError)        => set({ syncError }),
      clearExternalEvents: () =>
        set({
          outlookEvents: [], googleEvents: [], appleEvents: [], demoLocalEvents: [],
          outlookWindows: [], googleWindows: [],
        }),
    }),
    {
      name: 'lumina-planner',
      /**
       * F5.5: persisted with no `version`, so zustand had no way to know an
       * old payload was an old SHAPE. A rename or a type change would rehydrate
       * last release's object straight into this release's store — silently,
       * with no error and no way to detect it afterwards.
       *
       * `version: 1` plus a `migrate` that drops anything it does not
       * recognise is the cheap correct answer: this store persists two connection booleans,
       * so discarding an unknown payload costs the user a re-read of the integration status it already fetches on mount.
       */
      version: 1,
      migrate: (persisted, from) => {
        // Anything written before versioning existed is shape-unknown.
        if (from < 1) return {} as Record<string, unknown>;
        return persisted as Record<string, unknown>;
      },
      // Explicit return type guarantees event arrays can NEVER accidentally
      // be added to localStorage persistence in a future edit.
      partialize: (state): { outlookConnected: boolean; googleConnected: boolean } => ({
        outlookConnected: state.outlookConnected,
        googleConnected: state.googleConnected,
      }),
    }
  )
);
