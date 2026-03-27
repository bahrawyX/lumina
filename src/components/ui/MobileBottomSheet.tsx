'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';

interface MobileBottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  draggable?: boolean;
  closeOnBackdrop?: boolean;
  showHandle?: boolean;
}

export const MobileBottomSheet: React.FC<MobileBottomSheetProps> = ({
  open,
  onClose,
  title,
  children,
  className,
  contentClassName,
  draggable = true,
  closeOnBackdrop = true,
  showHandle = true,
}) => {
  const isMobile = useIsMobile();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-[2px]"
            onClick={closeOnBackdrop ? onClose : undefined}
          />

          <div className="fixed inset-0 z-[121] flex items-end md:items-center justify-center pointer-events-none p-0 md:p-4">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              initial={isMobile ? { y: '100%' } : { opacity: 0, y: 12, scale: 0.97 }}
              animate={isMobile ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
              exit={isMobile ? { y: '100%' } : { opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              drag={isMobile && draggable ? 'y' : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.24 }}
              onDragEnd={(_, info) => {
                if (!isMobile || !draggable) return;
                if (info.offset.y > 110 || info.velocity.y > 650) {
                  onClose();
                }
              }}
              className={cn(
                'pointer-events-auto w-full max-w-md bg-card/95 backdrop-blur-xl border-t border-border md:border md:border-border',
                'rounded-t-3xl md:rounded-2xl shadow-2xl',
                className,
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {isMobile && showHandle && (
                <div className="w-12 h-1.5 bg-muted-foreground/25 rounded-full mx-auto mt-3" />
              )}

              <div className={cn('px-4 md:px-6 py-4 md:py-6 pb-[max(1rem,env(safe-area-inset-bottom))]', contentClassName)}>
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

MobileBottomSheet.displayName = 'MobileBottomSheet';
