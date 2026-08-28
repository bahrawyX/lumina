/**
 * P0-4 — the app-wide focus indicator.
 *
 * The previous test for this greped `globals.css` for the `*:focus-visible`
 * selector and passed. The rule was present; it just never applied, because a
 * blanket `*:focus { outline: none !important }` sat three lines above it and
 * an important author declaration beats a normal one before specificity or
 * layer order is consulted. A keyboard-focused element matches BOTH selectors,
 * so the ring was dead app-wide while a test asserted it existed.
 *
 * These tests reason about the cascade instead of the text: they find every
 * rule that suppresses a focus indicator and check whether it can match an
 * element that is `:focus-visible`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

interface Rule {
  selector: string;
  body: string;
}

/**
 * Flat rule scan. Good enough: nothing here nests focus rules inside @media.
 *
 * Comments are stripped from the WHOLE source first, not per-selector. The
 * comment above this fix quotes the broken rule verbatim — braces included —
 * so a scanner that strips comments afterwards parses the prose as a selector
 * and reports the explanation as the defect.
 */
function rules(source: string): Rule[] {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    const selector = m[1].trim();
    if (!selector || selector.startsWith('@')) continue;
    out.push({ selector, body: m[2] });
  }
  return out;
}

/**
 * Declarations that REMOVE a visible focus indicator. Tailwind rings are
 * box-shadows, so both properties count.
 *
 * The value must be the whole declaration: `box-shadow: 0 6px 16px …` sets a
 * shadow and must not be mistaken for `box-shadow: 0`, which clears one.
 */
const SUPPRESSES = /(?:^|;)\s*(?:outline|box-shadow)\s*:\s*(?:none|0)\s*(?:!important)?\s*(?:;|$)/i;

/**
 * Can this selector match an element that is `:focus-visible`?
 *
 * `:focus-visible` implies `:focus`, so `*:focus` DOES match a
 * keyboard-focused element. The only thing that excludes one is an explicit
 * `:not(:focus-visible)`.
 */
function canMatchFocusVisible(selector: string): boolean {
  return selector
    .split(',')
    .map((s) => s.trim())
    .some((s) => /:focus\b/.test(s) && !/:not\(\s*:focus-visible\s*\)/.test(s));
}

describe('P0-4 — the keyboard focus ring survives the cascade', () => {
  const all = rules(css);

  it('no !important rule suppresses the indicator on a focus-visible element', () => {
    // This is the actual defect, stated directly. `*:focus { outline: none
    // !important }` fails here; `*:focus:not(:focus-visible) { … }` passes.
    const offenders = all
      .filter((r) => SUPPRESSES.test(r.body) && /!important/i.test(r.body))
      .filter((r) => canMatchFocusVisible(r.selector))
      .map((r) => r.selector);

    expect(offenders).toEqual([]);
  });

  it('and no normal-weight rule does either, unless a later rule restores it', () => {
    // Without !important the ring could still be lost to source order, so the
    // suppressor must be scoped rather than merely un-important-ed.
    const offenders = all
      .filter((r) => SUPPRESSES.test(r.body))
      .filter((r) => canMatchFocusVisible(r.selector))
      .map((r) => r.selector);

    expect(offenders).toEqual([]);
  });

  it('the mouse-click suppression is still there — this is not a revert', () => {
    // The rule exists for a real reason: `:focus` fires on mouse-down, and the
    // ring system made every button glow purple after a click. Deleting the
    // suppressor outright would fix a11y by regressing what it was written for.
    const suppressor = all.find(
      (r) => /:focus:not\(\s*:focus-visible\s*\)/.test(r.selector) && SUPPRESSES.test(r.body),
    );
    expect(suppressor).toBeDefined();
    expect(suppressor!.body).toMatch(/box-shadow\s*:\s*none/);
  });

  it('a visible ring is actually declared for focus-visible', () => {
    const ring = all.find((r) => /^\*:focus-visible$/.test(r.selector));
    expect(ring).toBeDefined();
    expect(ring!.body).toMatch(/outline:\s*2px solid hsl\(var\(--ring\)\)/);
    expect(ring!.body).toMatch(/outline-offset/);
  });

  it('--ring is defined in both themes, or the outline paints transparent', () => {
    const darkAt = css.indexOf('.dark');
    expect(css.slice(0, darkAt)).toMatch(/--ring:\s*[\d.]+\s+[\d.]+%\s+[\d.]+%/);
    expect(css.slice(darkAt)).toMatch(/--ring:\s*[\d.]+\s+[\d.]+%\s+[\d.]+%/);
  });
});

describe('P0-4 — the Tailwind ring utilities are not collaterally killed', () => {
  it('components that opt into focus-visible:ring still get a box-shadow', () => {
    // `box-shadow: none !important` on `*:focus` disabled every
    // `focus-visible:ring-*` in the app. These are the call sites that were
    // silently doing nothing.
    const form = readFileSync(
      resolve(process.cwd(), 'src/components/auth/EmailAuthForm.tsx'),
      'utf8',
    );
    expect(form).toMatch(/focus-visible:ring/);

    const suppressors = rules(css)
      .filter((r) => /box-shadow\s*:\s*none/i.test(r.body))
      .filter((r) => canMatchFocusVisible(r.selector));
    expect(suppressors).toEqual([]);
  });
});
