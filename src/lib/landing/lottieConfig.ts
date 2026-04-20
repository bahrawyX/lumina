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
    src: 'https://assets-v2.lottiefiles.com/a/145dc8b8-116b-11ee-835a-cbdd4c613142/fnX8qkDXkL.lottie',
    intent: 'Floating calendar/planner dashboard that feels alive',
    searchTerm: 'calendar schedule planner dashboard',
    behavior: 'autoplay-loop',
  },
  featureCheck: {
    src: 'https://assets-v2.lottiefiles.com/a/b36cb88a-1150-11ee-8f49-9b6c0bfe85bb/Y50UE4gUwg.lottie',
    intent: 'Checkmark burst with sparkle — plays when feature card enters view',
    searchTerm: 'checkmark success task complete',
    behavior: 'once-on-view',
  },
  pomodoroRing: {
    src: 'https://assets-v2.lottiefiles.com/a/6c1b20e4-1177-11ee-9e89-778f350cc6b9/MFflSBATh0.lottie',
    intent: 'Circular progress ring filling up — pomodoro session complete',
    searchTerm: 'timer circle countdown progress',
    behavior: 'once-on-hover',
  },
  soundWaves: {
    src: 'https://assets-v2.lottiefiles.com/a/a73eb2d8-1179-11ee-83a9-8faaffe0d6a1/ICvcPGE56U.lottie',
    intent: 'Headphones / sound waves — continuous ambient motion',
    searchTerm: 'sound wave audio equalizer headphones',
    behavior: 'ambient-loop',
  },
  aiSparkle: {
    src: 'https://assets-v2.lottiefiles.com/a/6d1224de-1172-11ee-8e99-2f3c8126c19c/sOXidENOzm.lottie',
    intent: 'Brain with sparkle / lightbulb / magic wand — represents AI',
    searchTerm: 'AI brain sparkle lightbulb',
    behavior: 'autoplay-loop',
  },
  rocket: {
    src: 'https://assets-v2.lottiefiles.com/a/5de84460-a34a-11ee-b470-83e52242919a/SfozhTvKjU.lottie',
    intent: 'Rocket launching — synchronized with CountUp stats',
    searchTerm: 'rocket launch takeoff',
    behavior: 'once-on-view',
  },
  confetti: {
    src: 'https://assets-v2.lottiefiles.com/a/e7df6e94-1170-11ee-9640-1b85e6ca1c88/useeXXBWNy.lottie',
    intent: 'Confetti burst celebration — plays on CTA section entry + click',
    searchTerm: 'confetti celebration burst party',
    behavior: 'once-on-view',
  },
  navSparkle: {
    src: 'https://assets-v2.lottiefiles.com/a/362d1336-1166-11ee-b318-6fb6adbd5325/kovVpaslMa.lottie',
    intent: 'Tiny subtle sparkle on Get Started button',
    searchTerm: 'sparkle shine glint tiny',
    behavior: 'ambient-loop',
  },
  untangle: {
    src: 'https://assets-v2.lottiefiles.com/a/ab5b0866-2155-11ef-93b3-63b32e34d0cf/IpM74ywaZF.lottie',
    intent: 'Sparkle burst — represents unifying scattered apps',
    searchTerm: 'untangle lines organize simplify',
    behavior: 'once-on-view',
  },
  wave: {
    src: 'https://assets-v2.lottiefiles.com/a/91cc0ece-1150-11ee-b7cb-d3afb5c0c001/l07O4nRg7q.lottie',
    intent: 'Waving hand or beating heart — warmth in footer',
    searchTerm: 'wave hand greeting heartbeat',
    behavior: 'ambient-loop',
  },
  // ── Focus modes section ──────────────────────────────────────────────────────
  focusPomodoro: {
    src: 'https://assets-v2.lottiefiles.com/a/a159ecda-116e-11ee-9e9f-dbb6d3359482/194g5Fuhjp.lottie',
    intent: 'Tomato — the classic Pomodoro icon',
    searchTerm: 'tomato pomodoro vegetable fruit',
    behavior: 'ambient-loop',
  },
  focusTimer: {
    src: 'https://assets-v2.lottiefiles.com/a/775b430e-116c-11ee-bee1-a3fd8ded352f/O6riMOS34g.lottie',
    intent: 'Focus countdown timer — dedicated task timer',
    searchTerm: 'countdown timer clock focus',
    behavior: 'ambient-loop',
  },
  focusStopwatch: {
    src: 'https://assets-v2.lottiefiles.com/a/c91df888-117d-11ee-9ee5-530c4c64fa7d/1dC9Gi1io0.lottie',
    intent: 'Stopwatch with running seconds hand — open-ended timing',
    searchTerm: 'stopwatch clock running timer',
    behavior: 'ambient-loop',
  },
  focusSounds: {
    src: 'https://assets-v2.lottiefiles.com/a/a73eb2d8-1179-11ee-83a9-8faaffe0d6a1/ICvcPGE56U.lottie',
    intent: 'Headphones with sound waves — ambient audio',
    searchTerm: 'headphones music sound ambient',
    behavior: 'ambient-loop',
  },
} as const;

export type LottieSlotKey = keyof typeof LOTTIES;
