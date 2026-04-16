'use client';

import { useIsMobile } from '@/hooks/useIsMobile';
import { LandingNav } from './LandingNav';
import { HeroSection } from './HeroSection';
import { ProblemStatement } from './ProblemStatement';
import { FeatureShowcase } from './FeatureShowcase';
import { FocusModesSection } from './FocusModesSection';
import { AIInsightsSection } from './AIInsightsSection';
import { StatsBar } from './StatsBar';
import { CTASection } from './CTASection';
import { LandingFooter } from './LandingFooter';
import { CustomCursor } from './CustomCursor';

export function LandingPage() {
  const isMobile = useIsMobile();

  return (
    <div className={`min-h-screen bg-background text-foreground ${!isMobile ? 'cursor-none' : ''}`}>
      <CustomCursor />
      <LandingNav />
      <main>
        <HeroSection />
        <ProblemStatement />
        <FeatureShowcase />
        <FocusModesSection />
        <AIInsightsSection />
        <StatsBar />
        <CTASection />
      </main>
      <LandingFooter />
    </div>
  );
}
