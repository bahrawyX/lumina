import { create } from 'zustand';
import { playTrack, stopTrack, setTrackVolume } from '@/lib/audio/noiseGenerator';
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

export const useAmbientStore = create<AmbientState & AmbientActions>()((set, get) => ({
  isPlaying: false,
  activeTrack: null,
  volume: 0.6,
  drawerOpen: false,

  setTrack: (track) => {
    // Always stop current audio first — no two nodes simultaneously
    stopTrack();

    if (track === null) {
      set({ isPlaying: false, activeTrack: null });
    } else {
      const { volume } = get();
      playTrack(track, volume);
      set({ isPlaying: true, activeTrack: track });
    }
  },

  setVolume: (v) => {
    const clamped = Math.max(0, Math.min(1, v));
    setTrackVolume(clamped);
    set({ volume: clamped });
  },

  stop: () => {
    // Destroy audio node, then update state
    stopTrack();
    set({ isPlaying: false, activeTrack: null });
  },

  openDrawer: () => set({ drawerOpen: true }),

  closeDrawer: () => set({ drawerOpen: false }),
}));
