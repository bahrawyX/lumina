'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LottieAnimation } from './LottieAnimation';

/**
 * Full-screen overlay that shows a centered Lottie animation and auto-dismisses.
 * Use for milestone celebrations (streak fire, goal trophy, etc).
 */
export const LottieOverlay: React.FC<{
  show: boolean;
  path: string;
  duration?: number;
  size?: number;
  onDone?: () => void;
}> = ({ show, path, duration = 2000, size = 160, onDone }) => {
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    if (show) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onDone?.();
      }, duration);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [show, duration, onDone]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            <LottieAnimation
              path={path}
              layerColorMap={{}}
              width={size}
              height={size}
              loop={false}
              autoplay={true}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
