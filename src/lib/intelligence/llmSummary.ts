import type { IntelligenceOutput } from './types';

export interface IntelligenceSummaryOptions {
  useLlm?: boolean;
}

export async function buildIntelligenceNarrative(
  output: IntelligenceOutput,
  _options?: IntelligenceSummaryOptions,
): Promise<string | null> {
  // Phase 2A keeps deterministic output as the source of truth.
  // This wrapper is intentionally optional and fallback-safe.
  const topRec = output.recommendations[0]?.explanation;
  const topFocus = output.focusWindows[0];

  if (!topRec && !topFocus) return null;

  if (topRec && topFocus) {
    return `${topRec} Best uninterrupted slot: ${topFocus.durationMinutes} minutes.`;
  }

  return topRec ?? `Best uninterrupted slot is ${topFocus?.durationMinutes ?? 0} minutes.`;
}
