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
 * F1.6: this file used to declare fifteen slots, NINE of which were referenced
 * by nothing, and its own header said the visuals were placeholders to "swap
 * before shipping" — committed, shipped, and still saying so. The dead slots
 * are gone; only the six the landing page actually renders remain.
 *
 * STILL OPEN: the six that remain load from `lottie.host` and
 * `assets-v2.lottiefiles.com`, and `@lottiefiles/dotlottie-web` resolves its
 * WASM renderer from jsdelivr/unpkg — so LCP on the marketing page depends on
 * three uncontrolled origins, and that is why `connect-src` has to stay open.
 * Self-hosting them means downloading third-party assets into this repo, which
 * needs a licence check per animation and is a deliberate decision rather than
 * a refactor. `LottieAnimation` now degrades to a neutral placeholder when a
 * fetch fails, so the failure mode is a quiet gap rather than an empty hole.
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
    // Original square placeholder animation used in the hero section.
    src: 'https://lottie.host/4db68bbd-31f6-4cd8-84eb-189de081159a/IGmMCqhzpt.lottie',
    intent: 'Abstract square / geometric animation — hero accent',
    searchTerm: 'abstract geometric shape square',
    behavior: 'autoplay-loop',
  },
  ctaCalendar: {
    // Calendar/planner dashboard shown in the CTA section (above the footer).
    src: 'https://assets-v2.lottiefiles.com/a/145dc8b8-116b-11ee-835a-cbdd4c613142/fnX8qkDXkL.lottie',
    intent: 'Floating calendar/planner dashboard that feels alive',
    searchTerm: 'calendar schedule planner dashboard',
    behavior: 'autoplay-loop',
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
