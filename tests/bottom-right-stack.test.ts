/**
 * The bottom-right corner: the install card and the tutorial's "?" button.
 *
 * They live in separate subtrees of `AppShell` and both position themselves
 * `fixed`, so neither can see the other. That was survivable only while the
 * card sat bottom-CENTRE and the button bottom-right — they missed each other
 * by layout accident. With both in the corner they have to be coordinated.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useBottomRightStack, STACK_GAP_PX } from '@/store/useBottomRightStack';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const codeOf = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

const install = codeOf(read('src/components/pwa/InstallPrompt.tsx'));
const tutorial = codeOf(read('src/components/tutorial/TutorialOverlay.tsx'));

beforeEach(() => {
  useBottomRightStack.setState({ installVisible: false, installHeight: 0 });
});

describe('the corner store', () => {
  it('starts empty, so the button rests at its own position', () => {
    const { installVisible, installHeight } = useBottomRightStack.getState();
    expect(installVisible).toBe(false);
    expect(installHeight).toBe(0);
  });

  it('carries the measured height, so the lift matches the real card', () => {
    useBottomRightStack.getState().setInstall(true, 132);
    expect(useBottomRightStack.getState().installVisible).toBe(true);
    expect(useBottomRightStack.getState().installHeight).toBe(132);
  });

  it('resets to zero when the card goes, so the button comes back down', () => {
    useBottomRightStack.getState().setInstall(true, 132);
    useBottomRightStack.getState().setInstall(false, 0);
    expect(useBottomRightStack.getState().installVisible).toBe(false);
    expect(useBottomRightStack.getState().installHeight).toBe(0);
  });

  it('leaves a gap so the two do not touch', () => {
    expect(STACK_GAP_PX).toBeGreaterThan(0);
  });
});

describe('the install card sits in the bottom-right corner', () => {
  it('is anchored right, not centred', () => {
    expect(install).toContain('right-4 sm:right-5');
    expect(install).not.toContain('left-1/2 -translate-x-1/2');
  });

  it('keeps clear of the mobile bottom bar', () => {
    // `bottom-20` on small screens, `bottom-6` once the bar is gone — the
    // original behaviour, preserved.
    expect(install).toContain('bottom-20 sm:bottom-6');
  });

  it('fades and settles downward on dismiss rather than snapping', () => {
    // The exit has to read as one movement with the button dropping into the
    // space, which means both are springs going the same direction.
    expect(install).toContain('exit={{ opacity: 0, y: 16, scale: 0.98 }}');
    expect(install).toContain("type: 'spring'");
  });
});

describe('the "?" button rides above the card', () => {
  it('reads the corner store', () => {
    expect(tutorial).toContain("useBottomRightStack((s) => s.installVisible)");
    expect(tutorial).toContain("useBottomRightStack((s) => s.installHeight)");
  });

  it('lifts by the measured height, and by nothing when the card is gone', () => {
    expect(tutorial).toContain('const lift = installVisible ? -installHeight : 0;');
    expect(tutorial).toContain('y: lift');
  });

  it('animates the lift with a spring, matching the card', () => {
    // A duration-based tween here would drift out of step with the card's
    // spring and the two would look unrelated.
    expect(tutorial).toContain("y: { type: 'spring'");
  });

  it('uses a transform, not `bottom`', () => {
    // `y` is composited; animating `bottom` would lay out on every frame.
    const btn = tutorial.slice(
      tutorial.indexOf('const FloatingTourButton'),
      tutorial.indexOf('const FloatingTourButton') + 1600,
    );
    expect(btn).toContain('fixed bottom-24 right-5');
    expect(btn).not.toMatch(/animate=\{\{[^}]*bottom:/);
  });
});

describe('the card reports its real height', () => {
  it('measures the element instead of hardcoding a number', () => {
    // The iOS Share-sheet body is taller than the standard prompt, so one
    // magic number is wrong for one of them.
    expect(install).toContain('getBoundingClientRect().height');
    expect(install).toContain('new ResizeObserver(publish)');
  });

  it('re-measures when the body switches to the iOS guide', () => {
    expect(install).toMatch(/\[show, showIOSGuide, setInstall\]/);
  });

  it('clears the corner on unmount, or the button stays stranded', () => {
    const effect = install.slice(install.indexOf('const cardRef'), install.indexOf('const handleInstall'));
    expect(effect).toContain('ro.disconnect();');
    expect(effect.lastIndexOf('setInstall(false, 0)')).toBeGreaterThan(effect.indexOf('ro.disconnect()'));
  });
});
