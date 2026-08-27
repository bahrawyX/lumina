/**
 * F1.4  — the custom cursor removed the clickability affordance and ignored
 *         reduced motion.
 * F1.12 — Lenis was missing `anchors`, and its reduced-motion check never
 *         re-ran.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isInteractiveTarget } from '@/components/landing/CustomCursor';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), 'src', 'components', 'landing', ...parts), 'utf8');

const cursor = read('CustomCursor.tsx');
const scroll = read('SmoothScroll.tsx');

/** Comments quote the patterns they replaced, so match against code only. */
const code = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

describe('F1.4 — the cursor signals what is clickable', () => {
  const mount = (html: string) => {
    document.body.innerHTML = html;
    return document.body;
  };

  it('recognises a link', () => {
    mount('<a href="/onboarding"><span id="t">Get started free</span></a>');
    expect(isInteractiveTarget(document.getElementById('t'))).toBe(true);
  });

  it('recognises a button and the text inside it', () => {
    mount('<button><span id="t">Sign in</span></button>');
    expect(isInteractiveTarget(document.getElementById('t'))).toBe(true);
  });

  it('recognises the carousel dots, which are role=tab', () => {
    mount('<button role="tab" id="t"></button>');
    expect(isInteractiveTarget(document.getElementById('t'))).toBe(true);
  });

  it('recognises role="button" on a non-button element', () => {
    mount('<div role="button" id="t">x</div>');
    expect(isInteractiveTarget(document.getElementById('t'))).toBe(true);
  });

  it('does NOT treat ordinary prose as clickable', () => {
    mount('<p id="t">Focused craft.</p>');
    expect(isInteractiveTarget(document.getElementById('t'))).toBe(false);
  });

  it('does not treat an anchor without href as clickable', () => {
    // A bare `<a>` is not a link and gets no pointer hand natively either.
    mount('<a id="t">not a link</a>');
    expect(isInteractiveTarget(document.getElementById('t'))).toBe(false);
  });

  it('handles a null target', () => {
    expect(isInteractiveTarget(null)).toBe(false);
  });
});

describe('F1.4 — the other three defects in the same file', () => {
  const src = code(cursor);

  it('bails under reduced motion', () => {
    // There was no check at all here, while SmoothScroll, LottieAnimation,
    // CountUp and BlurText all had one. A RAF-driven trailing cursor is a
    // classic vestibular trigger, and hiding the native cursor also defeats the
    // OS's cursor-size and high-contrast-cursor settings.
    expect(src).toContain('window.matchMedia("(prefers-reduced-motion: reduce)").matches');
    // Before the listeners are attached, not after.
    expect(src.indexOf('prefers-reduced-motion')).toBeLessThan(
      src.indexOf('document.addEventListener("mousemove"'),
    );
  });

  it('keeps the existing coarse-pointer bail', () => {
    expect(src).toContain('window.matchMedia("(pointer: coarse)").matches');
  });

  it('is visible on first paint, not first mousemove', () => {
    // The style hiding the native cursor was installed synchronously, but the
    // replacement started at opacity 0 and was only shown from inside
    // `render()`, which only ran on the first `mousemove`. Load the page and
    // don't move the mouse: there was no cursor at all.
    expect(src).toContain('mouseX = window.innerWidth / 2');
    expect(src).toContain('mouseY = window.innerHeight / 2');
    expect(src).toMatch(/\n\s*render\(\);/);
  });

  it('restores the native cursor on pagehide, not only on unmount', () => {
    // Cleanup ran on unmount ONLY, so a hard navigation or an error boundary
    // firing between mount and unmount left `data-lumina-cursor="on"` on <html>
    // for the life of the document — no cursor, and no recovery but a reload.
    expect(src).toContain('window.addEventListener("pagehide", restoreNativeCursor)');
    expect(src).toContain('window.removeEventListener("pagehide", restoreNativeCursor)');
  });

  it('has the CSS that makes the affordance visible', () => {
    const globals = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');
    expect(globals).toContain(".lumina-cursor[data-interactive='true']");
    expect(globals).toContain('scale: 1.6');
  });
});

describe('F1.12 — Lenis', () => {
  const src = code(scroll);

  it('handles in-page anchors, so #features is not a hard jump', () => {
    // Lenis 1.3 defaults `anchors` to false and this never passed it, so the
    // hero's "See how it works" was a native jump on a page whose entire
    // premise is smoothness.
    expect(src).toContain('anchors: { offset: -56 }');
  });

  it('stops inertia on navigate, so the jump does not overshoot', () => {
    expect(src).toContain('stopInertiaOnNavigate: true');
  });

  it('is not constructed at all on a coarse pointer', () => {
    // `syncTouch: false` left native touch scrolling alone, but the rAF loop
    // still ran every frame, forever, on mobile for no benefit.
    expect(src).toContain('if (coarsePointer.matches) return;');
  });

  it('re-runs when the OS motion preference changes', () => {
    // It was a one-shot `.matches` read at mount, so toggling the setting did
    // nothing until a full navigation — and a user turning motion OFF
    // mid-session is exactly who needs it to take effect immediately.
    expect(src).toContain('reduceMotion.addEventListener("change", onPreferenceChange)');
    expect(src).toContain('coarsePointer.addEventListener("change", onPreferenceChange)');
  });

  it('tears down cleanly on every path', () => {
    expect(src).toContain('reduceMotion.removeEventListener("change", onPreferenceChange)');
    expect(src).toContain('coarsePointer.removeEventListener("change", onPreferenceChange)');
    expect(src).toContain('cancelAnimationFrame(rafId)');
    expect(src).toContain('lenis?.destroy()');
  });

  it('never leaves two Lenis instances running', () => {
    // `start()` is called on mount AND from the preference-change handler.
    expect(src).toContain('if (lenis) return;');
  });
});
