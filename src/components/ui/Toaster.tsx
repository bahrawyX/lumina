'use client';

/**
 * Toaster — renders the live toast stack, fixed bottom-right.
 *
 * Add once at the App root: <Toaster />
 * Receives no props; reads state from useToastStore directly.
 *
 * Design:
 *   • Glass surface with backdrop-blur matching app modals/panels
 *   • 3 px primary left-border accent strip
 *   • Auto-dismiss progress bar (CSS transition, no JS intervals)
 *   • Spring entry: y:20→0, scale:0.95→1  |  exit: opacity→0, scale→0.93
 *   • Max 3 toasts — enforced by the store slice
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CloseIcon, UndoIcon } from '../icons';
import { useToastStore, Toast } from '../../store/useToastStore';

/* ── Single toast item ─────────────────────────────────────────────────────── */
const ToastItem: React.FC<{ toast: Toast }> = ({ toast }) => {
  const removeToast = useToastStore((s) => s.removeToast);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const [progressActive, setProgressActive] = useState(false);

  const dismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    removeToast(toast.id);
  };

  useEffect(() => {
    timerRef.current = setTimeout(dismiss, toast.duration);
    // Trigger progress bar on the next paint so the CSS transition fires correctly
    rafRef.current = requestAnimationFrame(() => setProgressActive(true));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id, toast.duration]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.93, y: 8, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      className={[
        'relative flex items-start gap-3 overflow-hidden',
        'min-w-[300px] max-w-[380px]',
        'px-4 pt-3.5 pb-4 rounded-2xl',
        // Glass surface
        'bg-white/95 dark:bg-neutral-panel/95 backdrop-blur-xl',
        // Border: 1 px all sides, 3 px primary accent on left
        'border border-gray-100 dark:border-neutral-border/60',
        'border-l-[3px] border-l-primary',
        // Elevation
        'shadow-[0_8px_32px_rgba(0,0,0,0.10),0_2px_8px_rgba(0,0,0,0.06)]',
        'dark:shadow-[0_8px_32px_rgba(0,0,0,0.50),0_2px_8px_rgba(0,0,0,0.30)]',
        'text-gray-800 dark:text-gray-100',
      ].join(' ')}
      role="status"
      aria-live="polite"
    >
      {/* Message */}
      <p className="flex-1 text-[12.5px] font-semibold leading-snug font-display pt-0.5">
        {toast.message}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        {toast.undoFn && (
          <button
            onClick={() => { toast.undoFn!(); dismiss(); }}
            className="flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary-hover transition-colors px-2.5 py-1 rounded-lg hover:bg-primary/8"
          >
            <UndoIcon size={11} strokeWidth={2.5} />
            Undo
          </button>
        )}
        <button
          onClick={dismiss}
          className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/6"
          aria-label="Dismiss"
        >
          <CloseIcon size={13} strokeWidth={2.5} />
        </button>
      </div>

      {/* Progress drain bar */}
      <div
        className="absolute bottom-0 left-0 h-[2px] bg-primary/25 origin-left"
        style={{
          width: '100%',
          transform: progressActive ? 'scaleX(0)' : 'scaleX(1)',
          transition: progressActive ? `transform ${toast.duration}ms linear` : 'none',
        }}
      />
    </motion.div>
  );
};

/* ── Toaster ───────────────────────────────────────────────────────────────── */
const Toaster: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 items-end pointer-events-none"
      aria-label="Notifications"
    >
      <AnimatePresence mode="sync">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default Toaster;
