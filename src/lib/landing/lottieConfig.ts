/**
 * Centralized Lottie animation config for the landing page.
 *
 * Every landing section reads its animation URL from this file so the user
 * can swap curated LottieFiles URLs in ONE place without touching components.
 *
 * ─── Sourcing your own animations ────────────────────────────────────────
 *
 * 1. Visit https://lottiefiles.com and find animations matching the search
 *    terms below. Filter for "Free" license (Lottie Simple License or CC0).
 * 2. On each animation's page, click "Download" → copy the `.lottie` URL.
 *    The URL looks like: https://lottie.host/<uuid>/<slug>.lottie
 * 3. Paste the URL into the `src` field below.
 * 4. If a CDN URL isn't available, download the `.lottie` or `.json` file
 *    into `public/lotties/` and set `src: "/lotties/your-file.lottie"`.
 *
 * ─── Current state ────────────────────────────────────────────────────────
 *
 * `DEMO_LOTTIE` is a publicly-available, confirmed-working animation that
 * acts as a placeholder across all 10 slots until you swap in your curated
 * picks. It was sourced from a public GitHub learning repo so it's safe to
 * use for dev. The visuals won't match each slot's intent — that's the
 * point; swap them before shipping.
 */

// Confirmed public URL — safe placeholder. Replace each LOTTIES.* entry.
const DEMO_LOTTIE = 'https://lottie.host/4db68bbd-31f6-4cd8-84eb-189de081159a/IGmMCqhzpt.lottie';

export interface LottieSlot {
  /** CDN URL or local path to the .lottie/.json file */
  src: string;
  /** Short description of what this animation should look like */
  intent: string;
  /** LottieFiles search term to find a replacement */
  searchTerm: string;
  /** Behavior flags for documentation — actual playback is controlled per-section */
  behavior: 'autoplay-loop' | 'once-on-view' | 'once-on-hover' | 'ambient-loop';
}

export const LOTTIES: Record<string, LottieSlot> = {
  hero: {
    src: DEMO_LOTTIE,
    intent: 'Floating calendar/planner dashboard that feels alive',
    searchTerm: 'calendar schedule planner dashboard',
    behavior: 'autoplay-loop',
  },
  featureCheck: {
    src: DEMO_LOTTIE,
    intent: 'Checkmark burst with sparkle — plays when feature card enters view',
    searchTerm: 'checkmark success task complete',
    behavior: 'once-on-view',
  },
  pomodoroRing: {
    src: DEMO_LOTTIE,
    intent: 'Circular progress ring filling up — pomodoro session complete',
    searchTerm: 'timer circle countdown progress',
    behavior: 'once-on-hover',
  },
  soundWaves: {
    src: DEMO_LOTTIE,
    intent: 'Sound waves / audio equalizer — continuous ambient motion',
    searchTerm: 'sound wave audio equalizer',
    behavior: 'ambient-loop',
  },
  aiSparkle: {
    src: DEMO_LOTTIE,
    intent: 'Brain with sparkle / lightbulb / magic wand — represents AI',
    searchTerm: 'AI brain sparkle lightbulb',
    behavior: 'autoplay-loop',
  },
  rocket: {
    src: DEMO_LOTTIE,
    intent: 'Rocket launching — synchronized with CountUp stats',
    searchTerm: 'rocket launch takeoff',
    behavior: 'once-on-view',
  },
  confetti: {
    src: DEMO_LOTTIE,
    intent: 'Confetti burst celebration — plays on CTA section entry + click',
    searchTerm: 'confetti celebration burst party',
    behavior: 'once-on-view',
  },
  navSparkle: {
    src: DEMO_LOTTIE,
    intent: 'Tiny subtle sparkle on Get Started button',
    searchTerm: 'sparkle shine glint tiny',
    behavior: 'ambient-loop',
  },
  untangle: {
    src: DEMO_LOTTIE,
    intent: 'Tangled lines untangling — represents unifying scattered apps',
    searchTerm: 'untangle lines organize simplify',
    behavior: 'once-on-view',
  },
  wave: {
    src: DEMO_LOTTIE,
    intent: 'Waving hand or beating heart — warmth in footer',
    searchTerm: 'wave hand greeting heartbeat',
    behavior: 'ambient-loop',
  },
} as const;

export type LottieSlotKey = keyof typeof LOTTIES;
