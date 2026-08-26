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
  // CustomCursor is LANDING-PAGE-ONLY on purpose. The authenticated app
  // (calendar, tasks, docs, focus, goals) relies on native cursor affordances
  // — drag handles, resize cursors, the Tiptap editor's text caret, etc.
  // Mounting the custom cursor globally overrode those and broke UX, so it
  // stays scoped here.
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SmoothScroll />
      <CustomCursor />
      <LandingNav />
      <main id="main-content" tabIndex={-1}>
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
