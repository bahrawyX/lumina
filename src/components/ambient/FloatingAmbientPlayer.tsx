'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAmbientStore } from '@/store/useAmbientStore';
import { useTutorialStore } from '@/store/useTutorialStore';
// Audio lifecycle is managed by useAmbientStore

const TRACK_LABELS: Record<string, string> = {
  white: 'White Noise',
  brown: 'Brown',
  rainfall: 'Rain',
  forest: 'Forest',
  ocean: 'Ocean',
};

export default function FloatingAmbientPlayer() {
  const { isPlaying, activeTrack, drawerOpen, stop } = useAmbientStore();
  const hasCompletedTutorial = useTutorialStore((s) => s.hasCompletedTutorial);

  const visible = isPlaying && !drawerOpen;
  const rightOffset = hasCompletedTutorial ? 16 : 72;

  const handleStop = () => {
    stop();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={handleStop}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          style={{ right: rightOffset, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}
          className="fixed z-[49] flex flex-col items-center gap-1 cursor-pointer group"
          title="Stop ambient sound"
        >
          {/* Circle with animated waveform */}
          <div className="w-12 h-12 rounded-full bg-card border border-border shadow-lg flex items-center justify-center gap-[3px] group-hover:border-primary/50 transition-colors">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-[3px] rounded-full bg-primary"
                animate={{ scaleY: [0.4, 1, 0.4] }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: 'easeInOut',
                }}
                style={{ height: 16, originY: 0.5 }}
              />
            ))}
          </div>

          {/* Track label */}
          {activeTrack && (
            <span className="text-[10px] text-muted-foreground font-medium">
              {TRACK_LABELS[activeTrack] ?? activeTrack}
            </span>
          )}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
