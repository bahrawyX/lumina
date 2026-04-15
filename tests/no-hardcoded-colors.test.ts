/**
 * Palette hygiene guard — blocks hard-coded Tailwind grays from sneaking
 * back into the codebase.
 *
 * Every color MUST use a semantic CSS variable (text-foreground, bg-card,
 * border-border, text-muted-foreground, etc.) so the warm paper light mode
 * and dark mode both render correctly. Hard-coded grays break the warm
 * palette because they're cool (pure desaturated) instead of 30-40° hue.
 *
 * Allowed exceptions: test fixtures, story files, intentional brand colors
 * (emerald/violet/amber for category-coded accents).
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

function grepTree(pattern: string): string[] {
  try {
    const out = execSync(
      `git grep -nE "${pattern}" -- "src/components/**/*.tsx" "src/app/**/*.tsx"`,
      { encoding: 'utf8' },
    );
    return out.split('\n').filter(Boolean);
  } catch {
    // git grep exits 1 when there are no matches — that's the pass case
    return [];
  }
}

describe('Palette hygiene — no cool greys in semantic code paths', () => {
  it('has no text-gray-* classes in components or app routes', () => {
    const hits = grepTree('text-gray-[0-9]+');
    expect(hits, `Found hard-coded text-gray-* — use text-foreground / text-muted-foreground instead:\n${hits.join('\n')}`).toEqual([]);
  });

  it('has no bg-gray-* classes', () => {
    const hits = grepTree('bg-gray-[0-9]+');
    expect(hits, `Found hard-coded bg-gray-* — use bg-card / bg-muted / bg-background:\n${hits.join('\n')}`).toEqual([]);
  });

  it('has no border-gray-* classes', () => {
    const hits = grepTree('border-gray-[0-9]+');
    expect(hits, `Found hard-coded border-gray-* — use border-border:\n${hits.join('\n')}`).toEqual([]);
  });

  it('has no bg-white-class hard-coded (allows bg-white/opacity gloss on SVG highlights)', () => {
    // Match bg-white NOT followed by / (plain bg-white, no opacity variant).
    // grep -E doesn't support lookbehind/lookahead so we filter in JS.
    const hits = grepTree('bg-white').filter(line => {
      // Skip opacity variants like bg-white/50, bg-white/[0.05]
      if (/bg-white\//.test(line)) return false;
      // Allow the intentional SVG gloss highlight in ShopItemIcon
      if (line.includes('ShopItemIcon')) return false;
      return /\bbg-white\b/.test(line);
    });
    expect(hits, `Found hard-coded bg-white — use semantic tokens (bg-card / bg-background). Hits:\n${hits.join('\n')}`).toEqual([]);
  });
});
