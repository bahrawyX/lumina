/**
 * Server-side word count from a doc's plain text. The client-sent `wordCount`
 * is never trusted (H3) — the 500-word coin reward gates on this value, so a
 * forged `{ wordCount: 500 }` on empty content yields 0 and earns nothing.
 */
export function computeWordCount(contentText: string | undefined | null): number {
  if (typeof contentText !== 'string') return 0;
  const trimmed = contentText.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
