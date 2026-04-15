import React from 'react';
import { motion } from 'framer-motion';
import Profile from '@/components/Profile';
import { GoogleCalendarSync } from '@/components/GoogleCalendarSync';

const IntelligencePage: React.FC = () => {
  return (
    <>
      <header className="flex items-end justify-between gap-4 mb-6 lg:mb-8 pb-4 lg:pb-5 border-b border-border/60 px-2 lg:px-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 mb-1.5">
            Workspace · Account
          </p>
          <h1 className="font-display text-2xl md:text-3xl font-medium text-foreground tracking-[-0.035em] leading-none">
            Insights
          </h1>
          <p className="text-[11px] md:text-xs text-muted-foreground/80 mt-2 italic">
            Your profile, connected accounts, and calendar sync.
          </p>
        </div>
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
