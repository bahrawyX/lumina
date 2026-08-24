import { create } from 'zustand';
import type { FetchFailure } from '@/lib/persistence/apiClient';

/**
 * Which bootstrap fetch failed, and why.
 *
 * `PersistenceBootstrap` used to convert every hydration failure into an empty
 * store and render on. The user then saw an empty calendar, an empty board and
 * zero goals with no error and no retry — indistinguishable from a brand-new
 * account. This store is the missing signal: it records which domains failed so
 * the shell can say so and offer a retry, instead of quietly presenting a
 * fabricated empty workspace as the truth.
 */
export type HydrationDomain =
  | 'events'
  | 'tasks'
  | 'focus'
  | 'planner'
  | 'docs'
  | 'goals'
  | 'coins'
  | 'achievements';

/** Human-readable name used in the failure banner. */
export const DOMAIN_LABELS: Record<HydrationDomain, string> = {
  events: 'calendar',
  tasks: 'tasks',
  focus: 'focus history',
  planner: 'daily plan',
  docs: 'documents',
  goals: 'goals',
  coins: 'coins',
  achievements: 'achievements',
};

interface HydrationStatusState {
  /** Domains that failed to load, with the failure that caused it. */
  failures: Partial<Record<HydrationDomain, FetchFailure['status']>>;
  /**
   * Bumped by `retry()`. `PersistenceBootstrap` watches it and re-runs the
   * whole bootstrap, so the retry affordance is a real retry rather than a
   * page reload that loses unsaved UI state.
   */
  retryNonce: number;
  /** True while a retry pass is in flight, so the button can disable itself. */
  retrying: boolean;

  markFailed: (domain: HydrationDomain, status: FetchFailure['status']) => void;
  markLoaded: (domain: HydrationDomain) => void;
  retry: () => void;
  retryFinished: () => void;
}

export const useHydrationStatusStore = create<HydrationStatusState>((set) => ({
  failures: {},
  retryNonce: 0,
  retrying: false,

  markFailed: (domain, status) =>
    set((s) => ({ failures: { ...s.failures, [domain]: status } })),

  markLoaded: (domain) =>
    set((s) => {
      if (!(domain in s.failures)) return s;
      const next = { ...s.failures };
      delete next[domain];
      return { failures: next };
    }),

  retry: () => set((s) => ({ retryNonce: s.retryNonce + 1, retrying: true })),
  retryFinished: () => set({ retrying: false }),
}));

/** Domains currently in a failed state, in a stable order. */
export function failedDomains(
  failures: HydrationStatusState['failures'],
): HydrationDomain[] {
  return (Object.keys(DOMAIN_LABELS) as HydrationDomain[]).filter((d) => d in failures);
}

/**
 * True when at least one failure is an auth failure — the user needs to sign in
 * again, not press retry.
 */
export function hasAuthFailure(failures: HydrationStatusState['failures']): boolean {
  return Object.values(failures).some((s) => s === 401 || s === 403);
}
