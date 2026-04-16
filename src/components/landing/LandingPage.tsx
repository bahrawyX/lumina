'use client';

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
import { SmoothScroll } from './SmoothScroll';

export function LandingPage() {
  // Note: `cursor-none` is no longer applied here — CustomCursor injects a
  // global `* { cursor: none !important }` stylesheet on mount (and tears it
  // down on unmount). That beats any Tailwind `cursor-pointer` on buttons,
  // which was the reason the real cursor bled through on hover.
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SmoothScroll />
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
