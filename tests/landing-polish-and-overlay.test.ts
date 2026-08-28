/**
 * F1.6  — seven eager third-party Lottie animations, one loaded twice.
 * F1.7  — eyebrow and label text failed WCAG AA across the page.
 * F1.8  — the mobile carousel clipped its own content.
 * F1.10 — nine landing components were `'use client'` with little to justify it.
 * F5.6  — the blocking hydration overlay showed signed-out users a spinner.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');
const landing = (...parts: string[]) => read('components', 'landing', ...parts);

const codeOf = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

/* ── WCAG contrast maths, so F1.7 is measured rather than asserted ───────── */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360; s /= 100; l /= 100;
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}
const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (rgb: number[]) => {
  const [r, g, b] = rgb.map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number[], b: number[]) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
/** What `text-x/50` actually paints: the colour composited onto the background. */
const atOpacity = (fg: number[], bg: number[], alpha: number) =>
  fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

describe('F1.7 — the eyebrow token clears WCAG AA', () => {
  const globals = read('app', 'globals.css');

  const token = (name: string, scope: 'light' | 'dark') => {
    // Light lives on `:root`; dark is redefined in the `.dark` block below it.
    const darkAt = globals.indexOf('.dark');
    const region = scope === 'light' ? globals.slice(0, darkAt) : globals.slice(darkAt);
    const m = region.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
    if (!m) throw new Error(`${name} not found in ${scope}`);
    return hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
  };

  it('the OLD pattern really did fail, in both themes', () => {
    // Guards the premise: if the palette ever changes so that /50 passes, this
    // test should be revisited rather than silently protecting nothing.
    const darkBg = token('background', 'dark');
    const darkMuted = token('muted-foreground', 'dark');
    expect(contrast(atOpacity(darkMuted, darkBg, 0.5), darkBg)).toBeLessThan(4.5);

    const lightBg = token('background', 'light');
    const lightMuted = token('muted-foreground', 'light');
    expect(contrast(atOpacity(lightMuted, lightBg, 0.5), lightBg)).toBeLessThan(4.5);
  });

  it('the new token passes at 4.5:1 in dark', () => {
    const bg = token('background', 'dark');
    expect(contrast(token('muted-foreground-subtle', 'dark'), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('the new token passes at 4.5:1 in light', () => {
    const bg = token('background', 'light');
    expect(contrast(token('muted-foreground-subtle', 'light'), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('it is still subtler than the plain muted foreground', () => {
    // Otherwise it is just `text-muted-foreground` with extra steps.
    const bg = token('background', 'dark');
    expect(contrast(token('muted-foreground-subtle', 'dark'), bg)).toBeLessThan(
      contrast(token('muted-foreground', 'dark'), bg),
    );
  });

  it('no landing component still uses the failing opacity modifiers', () => {
    const dir = join(process.cwd(), 'src', 'components', 'landing');
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.tsx') ? [join(d, e.name)] : [],
      );
    const offenders = walk(dir).filter((f) => {
      const code = codeOf(readFileSync(f, 'utf8'));
      return code.includes('text-muted-foreground/50') || code.includes('text-muted-foreground/60');
    });
    expect(offenders).toEqual([]);
  });

  it('is exposed through Tailwind, or the class name does nothing', () => {
    const config = readFileSync(join(process.cwd(), 'tailwind.config.js'), 'utf8');
    expect(config).toContain("'foreground-subtle': 'hsl(var(--muted-foreground-subtle))'");
  });
});

describe('F1.6 — the Lottie surface', () => {
  it('renders ONE hero, not two', () => {
    // Tailwind's `hidden` is `display: none` — it does not unmount — so both
    // the desktop and mobile instances fetched the third-party `.lottie` and
    // ran a canvas RAF loop, one of them inside an invisible box.
    const hero = codeOf(landing('HeroSection.tsx'));
    expect(hero.match(/<LottieAnimation/g) ?? []).toHaveLength(1);
    expect(hero).not.toContain('lg:hidden w-[200px] h-[200px]');
  });

  it('degrades to a placeholder instead of an empty hole', () => {
    // There was no `onError` and no poster anywhere. The animations load from
    // three external hosts, so a CDN 404 left the hero's 350x350 box and the
    // four focus icons permanently blank with nothing to explain it.
    const code = codeOf(landing('LottieAnimation.tsx'));
    expect(code).toContain('onError={() => setFailed(true)}');
    expect(code).toContain('data-lottie-fallback="true"');
  });

  it('declares only the slots something actually renders', () => {
    // Nine of fifteen were referenced by nothing, and the file's own header
    // said the visuals were placeholders to "swap before shipping".
    const config = read('lib', 'landing', 'lottieConfig.ts');
    const declared = [...config.matchAll(/^ {2}(\w+): \{/gm)].map((m) => m[1]).sort();
    expect(declared).toEqual([
      'ctaCalendar', 'focusPomodoro', 'focusSounds', 'focusStopwatch', 'focusTimer', 'hero',
    ]);
  });

  it('is honest that self-hosting is still open', () => {
    const config = read('lib', 'landing', 'lottieConfig.ts');
    expect(config).toContain('STILL OPEN');
    expect(config).not.toContain('swap them before shipping');
  });
});

describe('F1.8 — the mobile carousel does not clip', () => {
  const showcase = codeOf(landing('FeatureShowcase.tsx'));
  const slide = codeOf(landing('FeatureSlide.tsx'));

  it('uses the small viewport unit, not 100vh', () => {
    // `h-screen` is the LARGE viewport on iOS Safari, so content sat under the
    // retracting URL bar.
    expect(showcase).toContain('h-[100svh]');
    expect(showcase).not.toContain('sticky top-0 h-screen');
  });

  it('hides overflow on the axis the carousel moves, not both', () => {
    // `overflow-hidden` clipped the vertical excess with no way to reach it.
    expect(showcase).toContain('overflow-x-hidden flex flex-col');
  });

  it('lets the slide scroll and start at the top on mobile', () => {
    // `items-center` on a clipped box centres overflow into invisibility at
    // BOTH ends.
    expect(slide).toContain('overflow-y-auto');
    expect(slide).toContain('items-start md:items-center');
  });

  it('no longer tells mobile visitors to swipe', () => {
    // There is no touch handler anywhere in the landing subtree, so the first
    // instruction a mobile visitor was given did nothing.
    expect(slide).not.toContain('swipe or use arrow keys');
    expect(slide).toContain('scroll to explore');
  });

  it('and there is still no touch handler to justify that copy', () => {
    const dir = join(process.cwd(), 'src', 'components', 'landing');
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.tsx') ? [join(d, e.name)] : [],
      );
    const withTouch = walk(dir).filter((f) => /onTouchStart|drag="x"/.test(readFileSync(f, 'utf8')));
    expect(withTouch).toEqual([]);
  });
});

describe('F1.10 — static sections are server components', () => {
  for (const file of [
    'LandingPage.tsx',
    'ProblemStatement.tsx',
    'AIInsightsSection.tsx',
    'StatsBar.tsx',
    'LandingFooter.tsx',
  ]) {
    it(`${file} has no client boundary`, () => {
      expect(landing(file).startsWith("'use client'")).toBe(false);
    });
  }

  it('the interactive children still declare their own', () => {
    // The boundary moves DOWN — it does not disappear.
    for (const file of ['animations/Reveal.tsx', 'CursorZone.tsx', 'animations/CountUp.tsx']) {
      expect(landing(file).startsWith("'use client'"), file).toBe(true);
    }
  });

  it('the footer year is computed once, not on every render', () => {
    // `new Date().getFullYear()` inline was the only reason for the boundary,
    // and a hydration-mismatch hazard across a New Year boundary.
    const footer = landing('LandingFooter.tsx');
    expect(footer).toContain('const YEAR = new Date().getFullYear();');
    expect(footer).not.toContain('{new Date().getFullYear()}');
  });
});

describe('F5.6 — the hydration overlay', () => {
  const shell = read('app', '(app)', 'AppShell.tsx');
  const code = codeOf(shell);

  it('is not shown to a signed-out visitor', () => {
    // It was gated only on `onboardingCompleted`, which is TRUE for a
    // signed-out user whose localStorage says they finished onboarding — so
    // they got a full-screen z-9999 spinner while every fetch 401'd.
    expect(code).toContain('{onboardingCompleted && hasSession && !allHydrated && (');
  });

  it('treats a still-resolving session as present', () => {
    // The alternative is a flash of the app before the overlay appears.
    expect(code).toContain('shellSessionPending || Boolean(shellSession?.user)');
  });

  it('says what it is doing', () => {
    // The label element was empty, so at any duration the user stared at an
    // unlabelled spinner.
    expect(shell).toContain('Loading your workspace…');
  });

  it('does not dismiss into a silently empty board', () => {
    // The 3s escape hatch is correct; what it dismissed INTO was not.
    // `dbHydrated` is still false, so an empty board is indistinguishable from
    // "you have no data" and any edit is written against empty state.
    expect(code).toContain("markHydrationFailed('events', 'network')");
    expect(code).toContain("markHydrationFailed('tasks', 'network')");
    expect(code).toContain("markHydrationFailed('focus', 'network')");
  });

  it('only names the domains that actually failed', () => {
    // Marking all three would name domains that loaded fine and make the
    // retry banner lie.
    expect(code).toContain('if (!eventsHydrated) markHydrationFailed');
    expect(code).toContain('if (!tasksHydrated) markHydrationFailed');
  });

  it('and the banner that shows them is mounted', () => {
    expect(code).toContain('<HydrationFailureBanner />');
  });
});
