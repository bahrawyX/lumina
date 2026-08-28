'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { playTrack, stopTrack, setTrackVolume } from '@/lib/audio/noiseGenerator';
import type { AmbientTrack } from '@/types';

const VALID_TRACKS: AmbientTrack[] = ['brown', 'rainfall', 'forest', 'ocean'];

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
  hydrateTrackFromDb: (track: string | null) => void;
}

export const useAmbientStore = create<AmbientState & AmbientActions>()(
  persist(
    (set, get) => ({
      isPlaying: false,
      activeTrack: null,
      volume: 0.6,
      drawerOpen: false,

      setTrack: (track) => {
        const previous = { isPlaying: get().isPlaying, activeTrack: get().activeTrack };
        stopTrack();
        if (track === null) {
          set({ isPlaying: false, activeTrack: null });
        } else {
          playTrack(track, get().volume);
          set({ isPlaying: true, activeTrack: track });
        }
        void fetch('/api/users/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ambientTrack: track }),
        })
          .then((res) => {
            if (!res.ok) {
              // Server rejected — revert UI + audio to the prior selection so
              // local state matches the DB.
              stopTrack();
              if (previous.activeTrack) playTrack(previous.activeTrack, get().volume);
              set(previous);
            }
          })
          .catch(() => {
            stopTrack();
            if (previous.activeTrack) playTrack(previous.activeTrack, get().volume);
            set(previous);
          });
      },

      setVolume: (v) => {
        const clamped = Math.max(0, Math.min(1, v));
        setTrackVolume(clamped);
        set({ volume: clamped });
      },

      stop: () => {
        const previous = { isPlaying: get().isPlaying, activeTrack: get().activeTrack };
        stopTrack();
        set({ isPlaying: false, activeTrack: null });
        void fetch('/api/users/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ambientTrack: null }),
        })
          .then((res) => {
            if (!res.ok) {
              if (previous.activeTrack) playTrack(previous.activeTrack, get().volume);
              set(previous);
            }
          })
          .catch(() => {
            if (previous.activeTrack) playTrack(previous.activeTrack, get().volume);
            set(previous);
          });
      },

      openDrawer: () => set({ drawerOpen: true }),
      closeDrawer: () => set({ drawerOpen: false }),

      hydrateTrackFromDb: (track) => {
        const parsed = track && VALID_TRACKS.includes(track as AmbientTrack)
          ? (track as AmbientTrack)
          : null;
        // Restore selection only — never auto-play on hydration (browser autoplay policy)
        set((s) => s.activeTrack === null ? { activeTrack: parsed } : s);
      },
    }),
    {
      name: 'lumina-ambient',
      /**
       * F5.5: persisted with no `version`, so zustand had no way to know an
       * old payload was an old SHAPE. A rename or a type change would rehydrate
       * last release's object straight into this release's store — silently,
       * with no error and no way to detect it afterwards.
       *
       * `version: 1` plus a `migrate` that drops anything it does not
       * recognise is the cheap correct answer: this store persists a track name and a volume,
       * so discarding an unknown payload costs the user their sound settings returning to the defaults.
       */
      version: 1,
      migrate: (persisted, from) => {
        // Anything written before versioning existed is shape-unknown.
        if (from < 1) return {} as Record<string, unknown>;
        return persisted as Record<string, unknown>;
      },
      partialize: (s) => ({ activeTrack: s.activeTrack, volume: s.volume }),
    },
  ),
);
