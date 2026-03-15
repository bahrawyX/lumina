import React from 'react';
import { motion } from 'framer-motion';
import OnboardingFlow from '@/components/OnboardingFlow';

const OnboardingPage: React.FC = () => {
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
