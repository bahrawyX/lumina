'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDocsStore } from '@/store/useDocsStore';

export default function DocSaveIndicator() {
  const isSaving = useDocsStore((s) => s.isSaving);
  const lastSavedAt = useDocsStore((s) => s.lastSavedAt);

  // "✓ Saved" lingers for 3 seconds after a successful save, then fades out.
  // Without this, a quiet doc would keep "✓ Saved" forever — visually noisy.
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (!isSaving && lastSavedAt) {
      setShowSaved(true);
      const t = setTimeout(() => setShowSaved(false), 3000);
      return () => clearTimeout(t);
    }
  }, [isSaving, lastSavedAt]);

  return (
    <AnimatePresence mode="wait">
      {isSaving ? (
        <motion.span
          key="saving"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-pulse" />
          Saving…
        </motion.span>
      ) : showSaved ? (
        <motion.span
          key="saved"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-1 text-xs text-emerald-600/70 dark:text-emerald-400/70"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2 6l3 3 5-5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Saved
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}
