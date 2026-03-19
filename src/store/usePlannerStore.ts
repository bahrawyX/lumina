import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CalendarEvent } from '../types';

interface PlannerState {
  outlookEvents: CalendarEvent[];
  outlookConnected: boolean;
  outlookSyncing: boolean;

  setOutlookEvents: (events: CalendarEvent[]) => void;
  setOutlookConnected: (connected: boolean) => void;
  setOutlookSyncing: (syncing: boolean) => void;
}

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set) => ({
      outlookEvents: [],
      outlookConnected: false,
      outlookSyncing: false,

      setOutlookEvents: (outlookEvents) => set({ outlookEvents }),
      setOutlookConnected: (outlookConnected) => set({ outlookConnected }),
      setOutlookSyncing: (outlookSyncing) => set({ outlookSyncing }),
    }),
    {
      name: 'lumina-planner',
      partialize: (state) => ({ outlookConnected: state.outlookConnected }),
    }
  )
);
