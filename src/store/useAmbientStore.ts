import { create } from 'zustand';
import type { AmbientTrack } from '@/types';

interface AmbientState {
  isPlaying: boolean;
  activeTrack: AmbientTrack | null;
  volume: number;
  drawerOpen: boolean;
}

interface AmbientActions {
  setTrack: (track: AmbientTrack | null) => void;
  setVolume: (v: number) => void;
  stop: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}

export const useAmbientStore = create<AmbientState & AmbientActions>()((set) => ({
  isPlaying: false,
  activeTrack: null,
  volume: 0.6,
  drawerOpen: false,

  setTrack: (track) => {
    if (track === null) {
      set({ isPlaying: false, activeTrack: null });
    } else {
      set({ isPlaying: true, activeTrack: track });
    }
  },

  setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),

  stop: () => set({ isPlaying: false, activeTrack: null }),

  openDrawer: () => set({ drawerOpen: true }),

  closeDrawer: () => set({ drawerOpen: false }),
}));
