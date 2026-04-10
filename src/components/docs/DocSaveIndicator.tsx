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
          className="text-xs text-muted-foreground/60"
        >
          Saving…
        </motion.span>
      ) : lastSavedAt ? (
        <motion.span
          key="saved"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="text-xs text-emerald-500/60"
        >
          ✓ Saved
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}
