import React from 'react';
import { motion } from 'framer-motion';
import Profile from '@/components/Profile';
import { GoogleCalendarSync } from '@/components/GoogleCalendarSync';

const IntelligencePage: React.FC = () => {
  return (
    <>
      <header className="flex items-center justify-between mb-6 lg:mb-10 px-2 lg:px-4">
        <h2 className="font-display text-3xl lg:text-4xl font-semibold tracking-tight">
          Intelligence Engine
        </h2>
      </header>

      <div className="flex-1 min-h-0 relative">
        <motion.div 
          key="intelligence" 
          initial={{ opacity: 0, scale: 0.98 }} 
          animate={{ opacity: 1, scale: 1 }} 
          exit={{ opacity: 0, scale: 0.98 }} 
          transition={{ duration: 0.3 }} 
          className="h-full w-full overflow-y-auto no-scrollbar"
        >
          <div className="space-y-6 pb-6">
            <GoogleCalendarSync />
            <Profile />
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default IntelligencePage;
