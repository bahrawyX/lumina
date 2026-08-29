/**
 * The board: theming, reachability, and the full-screen toggle.
 *
 * ## The regression this exists to prevent
 *
 * `excalidraw-theme.css` used to contain:
 *
 *     .excalidraw.theme--dark { --theme-filter: none; }
 *
 * justified by "Excalidraw applies a CSS filter to invert its whole UI in dark
 * mode, and our variables are already correct dark values, so the filter would
 * invert them twice". Both halves were wrong.
 *
 * Exactly eight selectors in Excalidraw's stylesheet consume `--theme-filter`,
 * and not one of them is an island, toolbar or popup — the chrome is driven
 * purely by the CSS variables, which is why it themes correctly with the
 * filter left alone. What the filter actually covers is colour-bearing
 * surfaces authored in LIGHT values and inverted at paint time:
 * `.excalidraw.theme--dark canvas`, `.color-picker-swatch`,
 * `.color-picker__button`, `.color-picker-label-swatch`, the eye-dropper
 * preview and library thumbnails.
 *
 * So disabling it left the canvas literally white inside a dark app, and
 * rendered the five canvas-background presets as their raw values —
 * #ffffff, #f8f9fa, #f5faff, #fffce8, #fdf8f6 — five near-identical whites.
 * Picking any of them looked like nothing happened. That is the reported
 * "I can't change the background colour": not a broken picker, but every
 * option resolving to white.
 *
 * Verified in a browser after the fix: `--theme-filter` resolves to
 * `invert(93%) hue-rotate(180deg)`, the canvas carries it, and `.Island`
 * still reports `filter: none` with the themed dark background — i.e. the
 * chrome is untouched.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const themeCss = readFileSync(
  join(process.cwd(), 'src', 'components', 'board', 'excalidraw-theme.css'),
  'utf8',
);
const boardPage = readFileSync(
  join(process.cwd(), 'src', 'components', 'pages', 'BoardPage.tsx'),
  'utf8',
);
const appShell = readFileSync(
  join(process.cwd(), 'src', 'app', '(app)', 'AppShell.tsx'),
  'utf8',
);

/**
 * Code only. These files explain themselves at length, and the comments quote
 * the very things being asserted against — `--theme-filter: none`,
 * `requestFullscreen` — so a scan of the raw text matches the explanation
 * rather than the implementation.
 */
function withoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('the board keeps Excalidraw’s dark-mode filter', () => {
  it('never sets --theme-filter to none', () => {
    const declarations = withoutComments(themeCss);
    expect(declarations).not.toMatch(/--theme-filter\s*:\s*none/);
  });

  it('does not override --theme-filter at all', () => {
    // Any value is suspect: the filter is Excalidraw's own dark-mode
    // mechanism, and the chrome this file themes does not use it.
    const declarations = withoutComments(themeCss);
    expect(declarations).not.toMatch(/--theme-filter\s*:/);
  });

  it('still themes the chrome through variables, which is the part that works', () => {
    const declarations = withoutComments(themeCss);
    for (const token of ['--island-bg-color', '--popup-bg-color', '--button-bg']) {
      expect(declarations, `${token} missing — the chrome would fall back to Excalidraw's light values`)
        .toContain(token);
    }
  });

  it('matches the upstream stylesheet’s expectations, if it is installed', () => {
    // Pins the premise rather than trusting the comment: the canvas really is
    // what carries the filter. Skipped when node_modules is absent (CI cache).
    const upstream = join(
      process.cwd(), 'node_modules', '@excalidraw', 'excalidraw', 'dist', 'prod', 'index.css',
    );
    if (!existsSync(upstream)) return;
    const css = readFileSync(upstream, 'utf8');
    expect(css).toContain('.excalidraw.theme--dark canvas');
    expect(css).toMatch(/--theme-filter:\s*invert/);
  });
});

describe('the board is reachable on mobile', () => {
  it('appears in the More menu', () => {
    // It was in the desktop Sidebar only, so on a phone there was no route to
    // it at all — the page existed and nothing linked to it.
    const moreMenu = appShell.slice(appShell.indexOf('MORE_MENU_ITEMS'));
    expect(moreMenu).toContain("href: '/board'");
    expect(moreMenu).toContain("label: 'Board'");
  });

  it('stays out of the four-item bottom bar', () => {
    // The bar holds four primaries plus More; a fifth crowds a narrow phone.
    const bottomBar = appShell.slice(0, appShell.indexOf('MORE_MENU_ITEMS'));
    expect(bottomBar).not.toContain("href: '/board'");
  });
});

describe('the full-screen toggle', () => {
  it('exists and is labelled for assistive tech', () => {
    expect(boardPage).toMatch(/aria-label=\{maximized \? 'Exit full screen'/);
    expect(boardPage).toContain('aria-pressed={maximized}');
  });

  it('does not use the Fullscreen API, so Escape stays with the canvas', () => {
    // `requestFullscreen` hands Escape to the browser, and Excalidraw uses
    // Escape to cancel a drag and clear a selection — the same key would
    // abandon the shape being drawn AND exit full screen.
    const code = withoutComments(boardPage);
    expect(code).not.toContain('requestFullscreen');
    expect(code).not.toContain('exitFullscreen');
  });

  it('renders one board, so toggling cannot remount and lose the scene', () => {
    // Two <ExcalidrawBoard> in the same branch, or a keyed remount, would drop
    // the undo history and scroll position on every toggle.
    const mounts = boardPage.match(/<ExcalidrawBoard\b/g) ?? [];
    expect(mounts.length).toBe(2); // one per layout branch, never both at once
    expect(boardPage).toMatch(/if \(maximized\) \{/);
  });

  it('restores body overflow when it stops being maximized', () => {
    // Leaving `overflow: hidden` behind would freeze scrolling on every other
    // page for the rest of the session.
    expect(boardPage).toContain("document.body.style.overflow = 'hidden'");
    expect(boardPage).toMatch(/document\.body\.style\.overflow = previous/);
  });
});
