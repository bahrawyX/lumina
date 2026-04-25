'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import OnboardingFlow from '@/components/OnboardingFlow';
import { useOnboardingStore, useOnboardingHydrated } from '@/store/useOnboardingStore';
import { useGuestStore } from '@/store/useGuestStore';

const OnboardingPage: React.FC = () => {
  const router = useRouter();
  const onboardingHydrated = useOnboardingHydrated();
  const completed = useOnboardingStore((s) => s.completed);
  const isGuest = useGuestStore((s) => s.isGuest);

  // AppShell's onboarding redirect only applies to (app)/* routes — /onboarding
  // is a sibling route group, so a manually-typed /onboarding URL would re-render
  // the flow for an already-onboarded user. Redirect here when finished, except
  // for guests so they can still upgrade to a real account via the same flow.
  useEffect(() => {
    if (!onboardingHydrated) return;
    if (completed && !isGuest) {
      router.replace('/calendar');
    }
  }, [onboardingHydrated, completed, isGuest, router]);

  if (!onboardingHydrated) return null;
  if (completed && !isGuest) return null;

  return (
    <motion.div
      key="onboarding"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full h-screen"
    >
      <OnboardingFlow />
    </motion.div>
  );
};

export default OnboardingPage;
