import type { IntelligenceOutput, IntelligencePlannedItem } from './types';

export interface IntelligenceSummaryOptions {
  useLlm?: boolean;
  plannedItems?: IntelligencePlannedItem[];
}

export async function buildIntelligenceNarrative(
  output: IntelligenceOutput,
  _options?: IntelligenceSummaryOptions,
): Promise<string | null> {
  // Phase 2A keeps deterministic output as the source of truth.
  // This wrapper is intentionally optional and fallback-safe.
  const topRec = output.recommendations[0]?.explanation;
  const topFocus = output.focusWindows[0];
  const items = _options?.plannedItems ?? [];

  const parts: string[] = [];

  // Add planner context if items exist (cap at 5 to avoid bloat)
  if (items.length > 0) {
    const totalMinutes = items.reduce((sum, item) => {
      const start = new Date(item.startIso).getTime();
      const end = new Date(item.endIso).getTime();
      return sum + Math.round((end - start) / 60_000);
    }, 0);
    const hours = (totalMinutes / 60).toFixed(1);
    const names = items.slice(0, 5).map((item) => item.taskTitle);
    const nameList = names.join(', ') + (items.length > 5 ? ` (+${items.length - 5} more)` : '');
    parts.push(`${items.length} items planned today (${hours}h): ${nameList}.`);
  }

  if (topRec) parts.push(topRec);
  if (topFocus) parts.push(`Best uninterrupted slot: ${topFocus.durationMinutes} minutes.`);

  if (parts.length === 0) return null;

  return parts.join(' ');
}
