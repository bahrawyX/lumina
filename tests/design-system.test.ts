/**
 * Design system sanity tests.
 *
 * Guards the UI polish work so a future refactor can't silently strip:
 *   - the shared .card-lift utility
 *   - the grain overlay
 *   - the warm paper palette CSS variables
 *   - the editorial font stack
 *   - the shadow-card tokens in tailwind
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readFile = (relPath: string) =>
  readFileSync(resolve(process.cwd(), relPath), 'utf8');

describe('globals.css — crafted aesthetic tokens', () => {
  const css = readFile('src/app/globals.css');

  it('defines .card-lift utility with hover + focus-visible + reduced-motion fallback', () => {
    expect(css).toMatch(/\.card-lift\s*\{/);
    expect(css).toMatch(/\.card-lift:hover\s*\{/);
    expect(css).toMatch(/\.card-lift:focus-visible\s*\{/);
    expect(css).toMatch(/prefers-reduced-motion/);
  });

  it('uses the signature cubic-bezier easing on .card-lift', () => {
    expect(css).toMatch(/cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/);
  });

  it('ships a warm paper light palette (not pure white)', () => {
    // --background: warm paper HSL — hue in the 30s-40s
    expect(css).toMatch(/--background:\s+3\d\s+\d+%\s+\d+%/);
    // card-lift uses warm ink shadows (not pure black)
    expect(css).toMatch(/rgba\(17,17,28/);
  });

  it('defines a grain overlay via body::before', () => {
    expect(css).toMatch(/body::before\s*\{/);
    expect(css).toMatch(/feTurbulence/);
  });

  it('loads Clash Display + Clash Grotesk custom fonts', () => {
    expect(css).toMatch(/ClashDisplay-Variable/);
    expect(css).toMatch(/ClashGrotesk-Variable/);
  });

  it('sets display letter-spacing to the crafted -0.025em', () => {
    expect(css).toMatch(/letter-spacing:\s*-0\.025em/);
  });
});

describe('tailwind.config.js — shadow + font tokens', () => {
  const cfg = readFile('tailwind.config.js');

  it('exposes shadow-card / card-hover / card-lift tiers', () => {
    expect(cfg).toMatch(/card:\s*'0 1px 2px/);
    expect(cfg).toMatch(/'card-hover':/);
    expect(cfg).toMatch(/'card-lift':/);
  });

  it('defines a signature transition-timing-function token', () => {
    expect(cfg).toMatch(/signature:\s*'cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)'/);
  });

  it('font stack uses Geist + Clash (not Inter/Roboto)', () => {
    expect(cfg).toMatch(/ClashDisplay-Variable/);
    expect(cfg).toMatch(/--font-geist-sans/);
    expect(cfg).not.toMatch(/['"]Inter['"]/);
  });
});

describe('app/layout.tsx — Geist font variables wired', () => {
  const layout = readFile('src/app/layout.tsx');

  it('imports Geist from the npm package (not Google Fonts)', () => {
    expect(layout).toMatch(/from ['"]geist\/font\/sans['"]/);
    expect(layout).toMatch(/from ['"]geist\/font\/mono['"]/);
  });

  it('applies both font variables to <html>', () => {
    expect(layout).toMatch(/GeistSans\.variable/);
    expect(layout).toMatch(/GeistMono\.variable/);
  });
});
