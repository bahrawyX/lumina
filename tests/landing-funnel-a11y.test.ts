/**
 * F1.3  — two feature claims had no implementation behind them.
 * F1.5  — the carousel hijacked ArrowUp/ArrowDown across most of the page.
 * F1.9  — inactive carousel slides stayed in the accessibility tree.
 * F1.11 — no skip link, and every CTA was a `<button>` inside an `<a>`.
 * F1.14 — the robots.txt disallow rules matched none of the app's routes.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

const showcase = read('components', 'landing', 'FeatureShowcase.tsx');
const layout = read('app', 'layout.tsx');
const globals = read('app', 'globals.css');

describe('F1.3 — the landing page does not claim features that do not exist', () => {
  /** Every source file except the landing copy that used to assert them. */
  const sourceFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) sourceFiles.push(full);
    }
  };
  walk(join(process.cwd(), 'src'));

  const bodyOf = (file: string) =>
    readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');

  it('does not advertise "saved views"', () => {
    // The original grep returned exactly one hit in the whole repo — the
    // marketing bullet itself.
    const hits = sourceFiles.filter((f) => /saved views/i.test(bodyOf(f)));
    expect(hits).toEqual([]);
  });

  it('does not advertise "focus playlists"', () => {
    const hits = sourceFiles.filter((f) => /playlist/i.test(bodyOf(f)));
    expect(hits).toEqual([]);
  });

  it('says the true things instead', () => {
    // Filters and search do exist (`TaskFilterBar`), and there are four
    // ambient tracks.
    expect(showcase).toContain('Filters, search, and priority sorting');
    expect(showcase).toContain('Ambient sound mixer with four tracks');
  });
});

describe('F1.5 — vertical arrows belong to the browser', () => {
  it('the carousel handles only the horizontal arrows', () => {
    // The listener was on `window`, gated on "is the section anywhere on
    // screen" — and the section is h-screen sticky with a ghost spacer roughly
    // six viewport heights tall, so a keyboard user pressing ArrowDown to
    // SCROLL got a slide change instead, for most of the page.
    expect(showcase).toContain("if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;");
    expect(showcase).not.toContain("e.key === 'ArrowDown'");
    expect(showcase).not.toContain("e.key === 'ArrowUp'");
  });

  it('and only while focus is inside it', () => {
    expect(showcase).toContain('if (!active || !section.contains(active)) return;');
  });
});

describe('F1.9 — inactive slides are out of the accessibility tree', () => {
  it('hides and de-tabs every slide but the active one', () => {
    // All six sat in the tree at once, so a screen reader read every feature
    // list back-to-back and Tab walked into links the user could not see.
    expect(showcase).toContain('aria-hidden={i !== activeIndex}');
    // `inert` also removes them from the tab order, which aria-hidden does not.
    expect(showcase).toContain('inert={i !== activeIndex}');
  });

  it('finishes the tablist wiring rather than half-implementing it', () => {
    expect(showcase).toContain('aria-controls={`feature-slide-${slide.key}`}');
    expect(showcase).toContain('id={`feature-slide-${slide.key}`}');
    expect(showcase).toContain('tabIndex={i === activeIndex ? 0 : -1}');
  });
});

describe('F1.11 — a skip link, and CTAs that are one element', () => {
  it('the skip link is the first thing in the body', () => {
    const bodyStart = layout.indexOf('<body');
    const skipAt = layout.indexOf('<a href="#main-content"');
    expect(skipAt).toBeGreaterThan(bodyStart);
    // Nothing focusable between `<body>` and the link itself. Sliced up to the
    // link's own opening tag, not to its href, or the check trips on itself.
    const between = layout.slice(bodyStart, skipAt);
    expect(between).not.toMatch(/<(a|button|input)\b/);
  });

  it('is styled by an explicit class, not utility ordering', () => {
    // `sr-only focus:not-sr-only` depends on Tailwind emitting
    // `.focus\:not-sr-only:focus` after `.sr-only`. True today, but the failure
    // mode of a change is a skip link that never becomes visible.
    expect(layout).toContain('className="skip-link"');
    expect(globals).toContain('.skip-link {');
    expect(globals).toContain('.skip-link:focus {');
  });

  it('is off-screen rather than display:none, so it stays focusable', () => {
    const rule = globals.slice(globals.indexOf('.skip-link {'), globals.indexOf('.skip-link:focus'));
    expect(rule).toContain('left: -9999px');
    expect(rule).not.toContain('display: none');
    expect(rule).not.toContain('visibility: hidden');
  });

  it('targets a real landmark on both the landing page and the app', () => {
    expect(read('components', 'landing', 'LandingPage.tsx')).toContain('id="main-content"');
    expect(read('app', '(app)', 'AppShell.tsx')).toContain('id="main-content"');
  });

  it('no CTA nests a button inside an anchor', () => {
    // `<a>` containing `<button>` is an invalid content model with undefined
    // AT behaviour; the `tabIndex={-1}` was patching the double tab stop.
    const dir = join(process.cwd(), 'src', 'components', 'landing');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
      // Strip comments first — including JSX `{/* … */}` blocks, because the
      // comment explaining this very fix quotes the pattern it forbids.
      const src = readFileSync(join(dir, file), 'utf8')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');
      expect(src, file).not.toMatch(/<Link[^>]*tabIndex=\{-1\}/);
    }
  });

  it('uses the Button\'s existing asChild support', () => {
    for (const file of ['HeroSection.tsx', 'LandingNav.tsx', 'CTASection.tsx']) {
      expect(read('components', 'landing', file), file).toContain('<Button asChild');
    }
  });
});

describe('F1.14 — robots directives match the real routes', () => {
  const robots = read('app', 'robots.ts');

  it('drops the trailing slashes that matched nothing', () => {
    // Robots directives are literal prefix matches, so `Disallow: /calendar/`
    // never matched `/calendar`. In practice only `/api/` was blocked.
    for (const route of ['/calendar', '/tasks', '/docs', '/focus', '/onboarding']) {
      expect(robots, route).toContain(`'${route}',`);
      expect(robots, route).not.toContain(`'${route}/',`);
    }
  });

  it('still covers the app routes it means to', () => {
    for (const route of ['/api', '/auth', '/goals', '/shop', '/intelligence']) {
      expect(robots, route).toContain(`'${route}'`);
    }
  });
});
