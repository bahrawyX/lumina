import { create } from 'zustand';
import { CalendarEvent } from '../types';
import { isOutlookConnected as checkOutlookConnected } from '../lib/outlook/outlookAuth';
import { getCachedOutlookEvents } from '../services/outlookSyncService';

interface PlannerState {
  outlookEvents: CalendarEvent[];
  outlookConnected: boolean;
  outlookSyncing: boolean;

  setOutlookEvents: (events: CalendarEvent[]) => void;
  setOutlookConnected: (connected: boolean) => void;
  setOutlookSyncing: (syncing: boolean) => void;
}

export const usePlannerStore = create<PlannerState>((set) => ({
  outlookEvents: getCachedOutlookEvents(),
  outlookConnected: checkOutlookConnected(),
  outlookSyncing: false,

  setOutlookEvents: (outlookEvents) => set({ outlookEvents }),
  setOutlookConnected: (outlookConnected) => set({ outlookConnected }),
  setOutlookSyncing: (outlookSyncing) => set({ outlookSyncing }),
}));
