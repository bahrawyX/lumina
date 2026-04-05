'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAmbientStore } from '@/store/useAmbientStore';
import type { AmbientTrack } from '@/types';
import { AMBIENT_ICONS } from '@/components/ui/AnimatedIcons';
import { Slider } from '@/components/ui/slider';

const TRACKS: { id: AmbientTrack; label: string }[] = [
  { id: 'rainfall', label: 'Rainfall' },
  { id: 'brown', label: 'Brown Noise' },
  { id: 'forest', label: 'Forest' },
  { id: 'ocean', label: 'Ocean' },
];

export default function AmbientSoundDrawer() {
  const { drawerOpen, closeDrawer, activeTrack, isPlaying, volume, setTrack, setVolume, stop } =
    useAmbientStore();

  const handleTrackClick = (track: AmbientTrack) => {
    if (activeTrack === track && isPlaying) {
      stop();
    } else {
      setTrack(track);
    }
  };

  const handleVolumeChange = (values: number[]) => {
    setVolume(values[0]);
  };

  const handleStop = () => {
    stop();
  };

  const handleClose = () => {
    closeDrawer();
  };

  return (
    <AnimatePresence>
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-card border-t border-border shadow-lg pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-6"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
            </div>

            <div className="px-5 pb-4 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Ambient Sounds</h3>
                <button
                  type="button"
                  onClick={handleClose}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Volume slider — shadcn */}
              <div className="flex items-center gap-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground flex-shrink-0">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
                <Slider
                  value={[volume]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={handleVolumeChange}
                  aria-label="Volume"
                  className="flex-1"
                />
              </div>

              {/* Sound grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {TRACKS.map((t) => {
                  const active = activeTrack === t.id && isPlaying;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleTrackClick(t.id)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all duration-150 cursor-pointer select-none ${
                        active
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-muted/50 hover:bg-muted'
                      }`}
                    >
                      {(() => {
                        const AmbIcon = AMBIENT_ICONS[t.id];
                        return AmbIcon ? <AmbIcon size={32} /> : null;
                      })()}
                      <span className={`text-xs font-medium whitespace-nowrap ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                        {t.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Stop button */}
              {isPlaying && (
                <button
                  type="button"
                  onClick={handleStop}
                  className="w-full py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  Stop Playback
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
