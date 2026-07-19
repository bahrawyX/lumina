'use client';

import React from 'react';
import { LottieOverlay } from '@/components/ui/LottieOverlay';
import { useCelebrationStore } from '@/store/useCelebrationStore';

/**
 * Global completion-celebration overlay — the animated trophy shown on a real
 * goal or task completion award. Mounted once in AppShell so it works on every
 * page; triggered via `useCelebrationStore.celebrateForAward` from the goals and
 * tasks persistence layers (gated on the server's `coinsEarned > 0`, so it never
 * fires on a re-completion duplicate).
 */
export const CelebrationOverlay: React.FC = () => {
  const trophyVisible = useCelebrationStore((s) => s.trophyVisible);
  const dismissTrophy = useCelebrationStore((s) => s.dismissTrophy);
  return (
    <LottieOverlay
      show={trophyVisible}
      path="/animations/goal-trophy.json"
      duration={2000}
      size={200}
      onDone={dismissTrophy}
    />
  );
};
