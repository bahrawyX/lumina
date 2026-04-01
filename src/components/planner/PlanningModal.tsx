'use client';

import React, { useEffect, useState } from 'react';
import { MobileBottomSheet } from '@/components/ui/MobileBottomSheet';

const PLANNING_STEPS = [
  'Analyzing priorities...',
  'Optimizing focus windows...',
  'Crafting your perfect day...',
] as const;

interface PlanningModalProps {
  open: boolean;
  phase?: 'planning' | 'revealing';
  onClose?: () => void;
}

export const PlanningModal: React.FC<PlanningModalProps> = ({ open, phase = 'planning', onClose }) => {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);

    const id = window.setInterval(() => {
      setStepIndex((current) => (current + 1) % PLANNING_STEPS.length);
    }, 900);

    return () => window.clearInterval(id);
  }, [open]);

  const statusText = phase === 'revealing'
    ? 'Finalizing timeline reveal...'
    : PLANNING_STEPS[stepIndex];

  return (
    <MobileBottomSheet
      open={open}
      onClose={onClose ?? (() => {})}
      title="Planning Day"
      draggable
      closeOnBackdrop
      showHandle
      className="w-[min(92vw,460px)] md:rounded-2xl"
      contentClassName="px-6 py-7"
    >
        <div className="flex items-center gap-4">
          <div className="relative h-9 w-9 flex-shrink-0">
            <span className="absolute inset-0 rounded-full border-2 border-primary/30 border-t-transparent animate-spin" />
            <span className="absolute inset-1 rounded-full bg-primary/10 animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              {phase === 'revealing' ? 'Almost Ready' : 'Planning Day'}
            </p>
            <p className="mt-1 text-sm font-medium text-foreground transition-opacity duration-300">
              {statusText}
            </p>
          </div>
        </div>
    </MobileBottomSheet>
  );
};
