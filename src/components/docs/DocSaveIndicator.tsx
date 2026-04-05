'use client';

import React from 'react';
import { useDocsStore } from '@/store/useDocsStore';
import { motion, AnimatePresence } from 'framer-motion';

export default function DocSaveIndicator() {
  const isSaving = useDocsStore((s) => s.isSaving);
  const lastSavedAt = useDocsStore((s) => s.lastSavedAt);

  return (
    <AnimatePresence mode="wait">
      {isSaving ? (
        <motion.span
          key="saving"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="text-xs text-muted-foreground flex items-center gap-1"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-pulse" />
          Saving...
        </motion.span>
      ) : lastSavedAt ? (
        <motion.span
          key="saved"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="text-xs text-muted-foreground flex items-center gap-1"
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Saved
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}
