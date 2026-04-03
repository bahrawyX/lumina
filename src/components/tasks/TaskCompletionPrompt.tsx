'use client';

import React, { useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

interface TaskCompletionPromptProps {
  taskId: string;
  taskTitle: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 8000;

export const TaskCompletionPrompt: React.FC<TaskCompletionPromptProps> = ({
  taskTitle,
  onConfirm,
  onDismiss,
}) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const handleConfirm = useCallback(() => {
    onConfirm();
  }, [onConfirm]);

  const truncatedTitle =
    taskTitle.length > 36 ? taskTitle.slice(0, 36) + '...' : taskTitle;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="fixed bottom-6 right-6 z-[9000] w-72 bg-card border border-border/60 rounded-xl shadow-lg p-4 overflow-hidden"
    >
      <p className="text-xs text-muted-foreground">Event completed</p>
      <p className="text-sm font-medium text-foreground mt-1">
        Mark &ldquo;{truncatedTitle}&rdquo; as done?
      </p>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted-foreground text-sm px-3 py-1.5 rounded-lg hover:bg-muted/60 transition-colors"
        >
          Not yet
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="bg-primary text-primary-foreground text-sm px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
        >
          Mark as done
        </button>
      </div>

      {/* Progress bar — drains over 8 seconds */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary/30">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: AUTO_DISMISS_MS / 1000, ease: 'linear' }}
        />
      </div>
    </motion.div>
  );
};

export default TaskCompletionPrompt;
